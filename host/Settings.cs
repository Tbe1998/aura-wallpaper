using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace AuraWall
{
    /// <summary>用户设置：场景、配色、强度、帧率、跟随负载、开机自启。</summary>
    public sealed class Settings
    {
        public string Scene { get; set; } = "nebula";
        public string Accent { get; set; } = "silver";
        public double Intensity { get; set; } = 1.0;
        public int Fps { get; set; } = 30;
        public bool LoadFollow { get; set; } = true;
        public bool Paused { get; set; } = false;
        public bool PausedWhenFullscreen { get; set; } = true;

        private static string Dir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AURA");

        private static string FilePath => Path.Combine(Dir, "settings.json");

        public static Settings Load()
        {
            try
            {
                if (File.Exists(FilePath))
                {
                    var json = File.ReadAllText(FilePath, Encoding.UTF8);
                    var s = new JavaScriptSerializer().Deserialize<Settings>(json);
                    if (s != null) return s;
                }
            }
            catch (Exception ex) { Log.Write("读取设置失败：" + ex.Message); }
            return new Settings();
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                var json = new JavaScriptSerializer().Serialize(this);
                File.WriteAllText(FilePath, json, new UTF8Encoding(false));
            }
            catch (Exception ex) { Log.Write("保存设置失败：" + ex.Message); }
        }
    }
}
