using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

namespace AuraWall
{
    /// <summary>
    /// 仅绑定 127.0.0.1 的本地服务：给监控台页面提供文件与 /api/sample。
    /// 不开公网/局域网访问，也不读取任何隐私数据。
    /// </summary>
    public sealed class LocalServer : IDisposable
    {
        private readonly HttpListener _listener = new HttpListener();
        private readonly Sampler _sampler;
        private readonly string _root;
        private readonly object _jsonGate = new object();
        private Thread _thread;
        private volatile bool _running;
        private string _lastJson = "{}";
        private DateTime _lastSample = DateTime.MinValue;

        public int Port { get; }
        public string Url => "http://127.0.0.1:" + Port + "/";

        public LocalServer(Sampler sampler, int port)
        {
            _sampler = sampler;
            Port = port;
            _root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
            _listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
        }

        public bool Start()
        {
            try
            {
                _listener.Start();
                _running = true;
                _thread = new Thread(Loop) { IsBackground = true, Name = "AURA-local-http" };
                _thread.Start();
                Log.Write("本地服务已启动：" + Url);
                return true;
            }
            catch (Exception ex)
            {
                Log.Write("本地服务启动失败（端口 " + Port + "）：" + ex.Message);
                return false;
            }
        }

        private void Loop()
        {
            while (_running)
            {
                HttpListenerContext ctx = null;
                try { ctx = _listener.GetContext(); }
                catch { if (!_running) return; continue; }

                ThreadPool.QueueUserWorkItem(_ => Handle(ctx));
            }
        }

        private void Handle(HttpListenerContext ctx)
        {
            try
            {
                string path = ctx.Request.Url.AbsolutePath;
                if (path == "/api/sample")
                {
                    WriteJson(ctx, SampleJson());
                    return;
                }
                if (path == "/api/health")
                {
                    WriteJson(ctx, "{\"ok\":true,\"app\":\"aura\"}");
                    return;
                }

                if (path == "/" || path == "/console" || path == "/console/")
                    path = "/console/index.html";

                string rel = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string full = Path.GetFullPath(Path.Combine(_root, rel));

                // 防目录穿越
                if (!full.StartsWith(Path.GetFullPath(_root), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    ctx.Response.StatusCode = 404;
                    WriteBody(ctx, "text/plain", Encoding.UTF8.GetBytes("not found"));
                    return;
                }

                WriteBody(ctx, Mime(full), File.ReadAllBytes(full));
            }
            catch (Exception ex)
            {
                Log.Write("HTTP 处理失败：" + ex.Message);
                try { ctx.Response.StatusCode = 500; ctx.Response.Close(); } catch { }
            }
        }

        private string SampleJson()
        {
            lock (_jsonGate)
            {
                // 1 秒缓存：多个页面/窗口同时轮询也只采样一次
                if ((DateTime.UtcNow - _lastSample).TotalMilliseconds < 900 && _lastJson != "{}")
                    return _lastJson;
                try { _lastJson = _sampler.SampleJson(); _lastSample = DateTime.UtcNow; }
                catch (Exception ex) { Log.Write("采样失败：" + ex.Message); }
                return _lastJson;
            }
        }

        private static void WriteJson(HttpListenerContext ctx, string json)
        {
            WriteBody(ctx, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
        }

        private static void WriteBody(HttpListenerContext ctx, string mime, byte[] body)
        {
            ctx.Response.ContentType = mime;
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.ContentLength64 = body.Length;
            ctx.Response.OutputStream.Write(body, 0, body.Length);
            ctx.Response.OutputStream.Close();
        }

        private static string Mime(string p)
        {
            switch (Path.GetExtension(p).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".png": return "image/png";
                case ".ico": return "image/x-icon";
                default: return "application/octet-stream";
            }
        }

        public void Dispose()
        {
            _running = false;
            try { _listener.Stop(); } catch { }
            try { _listener.Close(); } catch { }
        }
    }
}
