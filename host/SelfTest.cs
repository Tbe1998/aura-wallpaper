using System;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace AuraWall
{
    /// <summary>无界面自检：初始化 WebView2、加载页面、确认三个场景的着色器都编译成功。</summary>
    internal static class SelfTest
    {
        public static int Run(string outPath)
        {
            var log = new StringBuilder();
            string state = null;
            int code = 1;

            var win = new WallpaperWindow(true);
            win.Ready += s => { state = s; };

            var timer = new Timer { Interval = 400 };
            var started = DateTime.UtcNow;

            timer.Tick += (o, e) =>
            {
                if (state != null)
                {
                    code = (state.Contains("\"scenes\":3") && state.Contains("\"scene\"")) ? 0 : 2;
                    timer.Stop();
                    win.Close();
                }
                else if ((DateTime.UtcNow - started).TotalSeconds > 30)
                {
                    timer.Stop();
                    win.Close();
                }
            };

            win.Shown += async (o, e) =>
            {
                bool ok = await win.InitializeAsync("");
                log.AppendLine("初始化 WebView2: " + ok);
                timer.Start();
            };

            Application.Run(win);

            log.AppendLine("页面状态: " + (state ?? "(超时，未收到)"));
            log.AppendLine("自检结果: " + (code == 0 ? "通过" : "失败"));
            try
            {
                if (!string.IsNullOrEmpty(outPath))
                    File.WriteAllText(outPath, log.ToString(), new UTF8Encoding(false));
            }
            catch { }
            return code;
        }
    }
}
