using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace AuraWall
{
    /// <summary>更新清单（放在 NAS 上的 update.json）。</summary>
    public sealed class UpdateInfo
    {
        public string version { get; set; }
        public string url { get; set; }
        public string sha256 { get; set; }
        public string notes { get; set; }
        public string date { get; set; }
        public long size { get; set; }
    }

    /// <summary>
    /// 自更新：从 NAS（或任一本机可达的 HTTP 源）读取 update.json，
    /// 下载 zip、校验 SHA-256、解包，然后由临时副本替换正在运行的程序并重启。
    /// </summary>
    public static class Updater
    {
        /// <summary>默认更新源：NAS 的外网地址（反代到 /volume1/web/aura）。</summary>
        public const string DefaultManifestUrl = "https://www.topbei.cn/aura/update.json";

        /// <summary>局域网兜底地址：外网不通时尝试它。</summary>
        public const string LanManifestUrl = "http://192.168.1.6/aura/update.json";

        public static string LocalVersion =>
            Assembly.GetExecutingAssembly().GetName().Version.ToString(3);

        public static string ResolveManifestUrl(Settings st)
        {
            return string.IsNullOrWhiteSpace(st.UpdateUrl) ? DefaultManifestUrl : st.UpdateUrl.Trim();
        }

        /// <summary>候选清单地址：用户自填优先，否则外网 + 局域网依次尝试。</summary>
        public static string[] ResolveManifestUrls(Settings st)
        {
            if (!string.IsNullOrWhiteSpace(st.UpdateUrl)) return new[] { st.UpdateUrl.Trim() };
            return new[] { DefaultManifestUrl, LanManifestUrl };
        }

        /// <summary>依次尝试候选地址，返回第一个可用的清单。</summary>
        public static UpdateInfo CheckAny(string[] urls, out string error, out string usedUrl)
        {
            error = null;
            usedUrl = null;
            foreach (var u in urls)
            {
                string err;
                var info = Check(u, out err);
                if (info != null)
                {
                    usedUrl = u;
                    return info;
                }
                error = (error == null ? "" : error + "；") + u + " → " + err;
            }
            return null;
        }

        public static UpdateInfo Check(string manifestUrl, out string error)
        {
            error = null;
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                using (var wc = new WebClient { Encoding = Encoding.UTF8 })
                {
                    wc.Headers[HttpRequestHeader.CacheControl] = "no-cache";
                    string json = wc.DownloadString(manifestUrl);
                    var info = new JavaScriptSerializer().Deserialize<UpdateInfo>(json);
                    if (info == null || string.IsNullOrEmpty(info.version) || string.IsNullOrEmpty(info.url))
                    {
                        error = "清单格式不正确";
                        return null;
                    }
                    return info;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        /// <summary>远端版本是否比本机新。</summary>
        public static bool IsNewer(string remote, string local)
        {
            Version r, l;
            if (!Version.TryParse(Normalize(remote), out r)) return false;
            if (!Version.TryParse(Normalize(local), out l)) return false;
            return r > l;
        }

        private static string Normalize(string v)
        {
            if (string.IsNullOrWhiteSpace(v)) return "0.0.0";
            v = v.Trim().TrimStart('v', 'V');
            var parts = v.Split('.');
            while (parts.Length < 3) v += ".0";
            return v;
        }

        /// <summary>相对清单地址把包地址补全。</summary>
        public static string AbsoluteUrl(string manifestUrl, string fileUrl)
        {
            if (string.IsNullOrEmpty(fileUrl)) return null;
            if (fileUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                fileUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return fileUrl;
            var u = new Uri(new Uri(manifestUrl), fileUrl);
            return u.ToString();
        }

        public static string Download(UpdateInfo info, string manifestUrl, Action<long, long> progress)
        {
            string url = AbsoluteUrl(manifestUrl, info.url);
            string dir = Path.Combine(Path.GetTempPath(), "AURA-update");
            Directory.CreateDirectory(dir);
            string zip = Path.Combine(dir, "AURA-" + info.version + ".zip");

            using (var wc = new WebClient())
            {
                wc.Headers[HttpRequestHeader.UserAgent] = "AURA-Updater";
                wc.DownloadProgressChanged += (s, e) => { if (progress != null) progress(e.BytesReceived, e.TotalBytesToReceive); };
                wc.DownloadFile(new Uri(url), zip);
            }

            if (!string.IsNullOrEmpty(info.sha256))
            {
                string actual = Sha256(zip);
                if (!string.Equals(actual, info.sha256.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    try { File.Delete(zip); } catch { }
                    throw new Exception("校验失败：下载包 SHA-256 与清单不一致");
                }
            }
            return zip;
        }

        public static string Sha256(string file)
        {
            using (var sha = SHA256.Create())
            using (var fs = File.OpenRead(file))
            {
                var hash = sha.ComputeHash(fs);
                var sb = new StringBuilder();
                foreach (var b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>
        /// 解包到临时目录，复制自身为 updater，交给它替换文件；随后退出主程序。
        /// </summary>
        public static void ApplyAndExit(string zipPath)
        {
            string staging = Path.Combine(Path.GetTempPath(), "AURA-staging-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
            Directory.CreateDirectory(staging);
            ZipFile.ExtractToDirectory(zipPath, staging);

            // zip 里通常有一层 AURA-vX.Y.Z-win64 目录，取含 exe 的那层
            string root = staging;
            if (!File.Exists(Path.Combine(root, "AURA.exe")))
            {
                foreach (var d in Directory.GetDirectories(staging))
                {
                    if (File.Exists(Path.Combine(d, "AURA.exe"))) { root = d; break; }
                }
            }
            if (!File.Exists(Path.Combine(root, "AURA.exe")))
                throw new Exception("更新包内没有找到 AURA.exe");

            string self = Application_ExecutablePath();
            string targetDir = Path.GetDirectoryName(self);
            string tempExe = Path.Combine(Path.GetTempPath(), "AURA-updater-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
            File.Copy(self, tempExe, true);

            var psi = new ProcessStartInfo(tempExe,
                "--apply \"" + root + "\" \"" + targetDir + "\" " + Process.GetCurrentProcess().Id)
            {
                UseShellExecute = false,
                WorkingDirectory = Path.GetTempPath()
            };
            Process.Start(psi);
        }

        private static string Application_ExecutablePath()
        {
            var p = Process.GetCurrentProcess().MainModule;
            return p != null ? p.FileName : System.Windows.Forms.Application.ExecutablePath;
        }

        /// <summary>更新器本体：等旧进程退出 → 覆盖文件 → 启动新版本。</summary>
        public static int Apply(string staging, string target, int pid)
        {
            try
            {
                for (int i = 0; i < 120; i++)
                {
                    try
                    {
                        var p = Process.GetProcessById(pid);
                        if (p.HasExited) break;
                    }
                    catch { break; }
                    Thread.Sleep(250);
                }
                Thread.Sleep(600);

                int failures = 0;
                foreach (var src in Directory.GetFiles(staging, "*", SearchOption.AllDirectories))
                {
                    string rel = src.Substring(staging.Length).TrimStart('\\', '/');
                    string dst = Path.Combine(target, rel);
                    Directory.CreateDirectory(Path.GetDirectoryName(dst));
                    for (int attempt = 0; attempt < 6; attempt++)
                    {
                        try { File.Copy(src, dst, true); break; }
                        catch (IOException) { Thread.Sleep(400); }
                        catch (UnauthorizedAccessException) { Thread.Sleep(400); }
                    }
                    if (!File.Exists(dst)) failures++;
                }

                Log.Write("更新完成，失败文件数：" + failures + "；正在重启。");
                Process.Start(new ProcessStartInfo(Path.Combine(target, "AURA.exe"))
                { UseShellExecute = true, WorkingDirectory = target });
                return failures == 0 ? 0 : 2;
            }
            catch (Exception ex)
            {
                Log.Write("更新失败：" + ex);
                try
                {
                    Process.Start(new ProcessStartInfo(Path.Combine(target, "AURA.exe"))
                    { UseShellExecute = true, WorkingDirectory = target });
                }
                catch { }
                return 1;
            }
        }
    }
}
