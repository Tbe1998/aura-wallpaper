using System;
using System.IO;
using System.Text;

namespace AuraWall
{
    /// <summary>命令行只检查更新：写一份结果到文件，便于排查更新源是否可达。</summary>
    internal static class UpdateCheck
    {
        public static int Run(string outPath, string urlOverride)
        {
            string manifest = string.IsNullOrWhiteSpace(urlOverride) ? Updater.DefaultManifestUrl : urlOverride;
            var sb = new StringBuilder();
            int code = 1;
            try
            {
                string err;
                var info = Updater.Check(manifest, out err);
                sb.AppendLine("更新源: " + manifest);
                sb.AppendLine("本机版本: " + Updater.LocalVersion);
                if (info == null)
                {
                    sb.AppendLine("读取失败: " + err);
                }
                else
                {
                    sb.AppendLine("远端版本: " + info.version);
                    sb.AppendLine("包地址: " + info.url);
                    sb.AppendLine("SHA-256: " + info.sha256);
                    sb.AppendLine("说明: " + info.notes);
                    sb.AppendLine("是否有更新: " + (Updater.IsNewer(info.version, Updater.LocalVersion) ? "是" : "否"));
                    code = 0;
                }
            }
            catch (Exception ex)
            {
                sb.AppendLine("异常: " + ex);
            }

            try
            {
                if (!string.IsNullOrEmpty(outPath)) File.WriteAllText(outPath, sb.ToString(), new UTF8Encoding(false));
            }
            catch { }
            return code;
        }
    }
}
