using System;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace AuraWall
{
    /// <summary>托盘菜单自检：用带分隔符的合成菜单跑一遍勾选逻辑，验证不会抛异常且勾选正确。</summary>
    internal static class TrayMenuCheck
    {
        public static int Run(string outPath)
        {
            var sb = new StringBuilder();
            int code = 1;
            try
            {
                Application.EnableVisualStyles();

                var st = new Settings { Scene = "fluid", Accent = "blue", Intensity = 1.35, Fps = 60, Paused = true };
                var menu = new ContextMenuStrip();

                var scene = new ToolStripMenuItem("场景");
                foreach (var id in new[] { "nebula", "fluid", "grid" })
                    scene.DropDownItems.Add(new ToolStripMenuItem(id) { Tag = id });
                menu.Items.Add(scene);

                var accent = new ToolStripMenuItem("配色");
                foreach (var id in new[] { "silver", "gold", "blue", "violet" })
                    accent.DropDownItems.Add(new ToolStripMenuItem(id) { Tag = id });
                menu.Items.Add(accent);

                var intensity = new ToolStripMenuItem("动效强度");
                foreach (var v in new[] { "0.7", "1", "1.35" })
                    intensity.DropDownItems.Add(new ToolStripMenuItem(v) { Tag = v });
                menu.Items.Add(intensity);

                menu.Items.Add(new ToolStripSeparator());          // 关键：分隔符

                var fps = new ToolStripMenuItem("帧率上限");
                foreach (var v in new[] { "24", "30", "60" })
                    fps.DropDownItems.Add(new ToolStripMenuItem(v) { Tag = v });
                menu.Items.Add(fps);

                menu.Items.Add(new ToolStripMenuItem("跟随电脑负载"));
                menu.Items.Add(new ToolStripSeparator());          // 再来一个
                menu.Items.Add(new ToolStripMenuItem("暂停动效"));

                TrayContext.ApplyChecks(menu, st);

                bool ok = true;
                foreach (ToolStripItem it in scene.DropDownItems)
                {
                    var m = (ToolStripMenuItem)it;
                    bool want = (string)m.Tag == "fluid";
                    if (m.Checked != want) { ok = false; sb.AppendLine("场景勾选错误: " + m.Tag); }
                }
                foreach (ToolStripItem it in accent.DropDownItems)
                {
                    var m = (ToolStripMenuItem)it;
                    bool want = (string)m.Tag == "blue";
                    if (m.Checked != want) { ok = false; sb.AppendLine("配色勾选错误: " + m.Tag); }
                }
                foreach (ToolStripItem it in intensity.DropDownItems)
                {
                    var m = (ToolStripMenuItem)it;
                    bool want = (string)m.Tag == "1.35";
                    if (m.Checked != want) { ok = false; sb.AppendLine("强度勾选错误: " + m.Tag); }
                }
                foreach (ToolStripItem it in fps.DropDownItems)
                {
                    var m = (ToolStripMenuItem)it;
                    bool want = (string)m.Tag == "60";
                    if (m.Checked != want) { ok = false; sb.AppendLine("帧率勾选错误: " + m.Tag); }
                }

                var pauseItem = (ToolStripMenuItem)menu.Items[menu.Items.Count - 1];
                if (pauseItem.Text != "继续动效") { ok = false; sb.AppendLine("暂停文案未同步: " + pauseItem.Text); }

                sb.AppendLine("菜单项总数: " + menu.Items.Count + "（含 2 个分隔符）");
                sb.AppendLine("勾选与文案检查: " + (ok ? "通过" : "失败"));
                code = ok ? 0 : 2;
            }
            catch (Exception ex)
            {
                sb.AppendLine("自检抛异常: " + ex);
                code = 3;
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
