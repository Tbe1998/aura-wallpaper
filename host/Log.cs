using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace AuraWall
{
    /// <summary>极简日志：写到 exe 同目录 aura.log，便于用户排查。</summary>
    internal static class Log
    {
        private static readonly object Gate = new object();
        private static string _path;

        public static string Path_
        {
            get
            {
                if (_path == null)
                {
                    try { _path = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "aura.log"); }
                    catch { _path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "aura.log"); }
                }
                return _path;
            }
        }

        public static void Write(string msg)
        {
            try
            {
                lock (Gate)
                {
                    var line = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}{2}",
                        DateTime.Now, msg, Environment.NewLine);
                    File.AppendAllText(Path_, line, Encoding.UTF8);
                }
                Debug.WriteLine(msg);
            }
            catch { /* 日志失败不影响主流程 */ }
        }
    }
}
