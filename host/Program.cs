using System;
using System.Threading;
using System.Windows.Forms;

namespace AuraWall
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--selftest")
            {
                return SelfTest.Run(args.Length > 1 ? args[1] : null);
            }

            bool windowed = Array.IndexOf(args, "--windowed") >= 0;

            using (var mutex = new Mutex(true, @"Local\AURA_Wallpaper_Single", out bool created))
            {
                if (!created) return 0;

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.ThreadException += (s, e) => Log.Write("界面线程异常：" + e.Exception);
                AppDomain.CurrentDomain.UnhandledException += (s, e) => Log.Write("未处理异常：" + e.ExceptionObject);

                try
                {
                    Application.Run(new TrayContext(windowed));
                }
                catch (Exception ex)
                {
                    Log.Write("启动失败：" + ex);
                    MessageBox.Show("AURA 启动失败：\n" + ex.Message + "\n\n详情见 aura.log",
                        "AURA", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
                GC.KeepAlive(mutex);
            }
            return 0;
        }
    }
}
