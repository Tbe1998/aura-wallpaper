using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AuraWall
{
    /// <summary>托盘控制中心：切换场景/配色/强度，跟随负载，开机自启，退出。</summary>
    public sealed class TrayContext : ApplicationContext
    {
        private readonly Settings _st;
        private readonly bool _windowed;

        private WallpaperWindow _win;
        private NotifyIcon _tray;
        private Timer _tick;        // 1s：负载采样 + 推送
        private Timer _watchdog;    // 4s：桌面层守护
        private SystemLoad _load;

        private string _lastForeground = "";

        public TrayContext(bool windowed)
        {
            _windowed = windowed;
            _st = Settings.Load();

            _load = new SystemLoad();
            CreateWindow();

            _tray = new NotifyIcon
            {
                Icon = LoadIcon(),
                Visible = true,
                Text = "AURA · 桌面动态背景"
            };
            _tray.DoubleClick += (s, e) => ShowBalloon("AURA 正在桌面图标下面运行，右键托盘图标可切换场景。");
            _tray.ContextMenuStrip = BuildMenu();

            _tick = new Timer { Interval = 1000 };
            _tick.Tick += OnTick;
            _tick.Start();

            _watchdog = new Timer { Interval = 4000 };
            _watchdog.Tick += OnWatchdog;
            _watchdog.Start();

            SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
            Log.Write("AURA 启动。场景=" + _st.Scene + " 配色=" + _st.Accent);
        }

        /* ------------------------------------------------------------ 窗口生命周期 */

        private void CreateWindow()
        {
            _win = new WallpaperWindow(_windowed);
            _win.Show();
            _win.InitializeAsync(QueryString());
            if (!_windowed) _win.AttachToDesktop();
        }

        private string QueryString()
        {
            return "?scene=" + _st.Scene +
                   "&accent=" + _st.Accent +
                   "&fps=" + _st.Fps +
                   "&intensity=" + _st.Intensity.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) +
                   "&paused=" + (_st.Paused ? "1" : "0");
        }

        private void OnWatchdog(object sender, EventArgs e)
        {
            if (_windowed) return;   // 预览窗口模式不挂桌面层，无需守护
            try
            {
                if (_win == null || !_win.IsHandleCreated || !_win.HostAlive)
                {
                    Log.Write("桌面层丢失（Explorer 重启或窗口被销毁），正在重建。");
                    Recreate();
                }
            }
            catch (Exception ex)
            {
                Log.Write("守护检查异常：" + ex.Message);
                Recreate();
            }
        }

        private void Recreate()
        {
            try { _win?.Dispose(); } catch { }
            _win = null;
            CreateWindow();
        }

        private void OnDisplayChanged(object sender, EventArgs e)
        {
            Log.Write("显示设置变化，重新铺满桌面。");
            Recreate();
        }

        /* ------------------------------------------------------------ 每秒推送 */

        private void OnTick(object sender, EventArgs e)
        {
            _load.Tick();

            bool pauseByFullscreen = false;
            if (_st.PausedWhenFullscreen && FullscreenActive()) pauseByFullscreen = true;

            _win?.Send(new
            {
                type = "config",
                value = new
                {
                    load = Math.Round(_load.Load, 3),
                    paused = _st.Paused || pauseByFullscreen
                }
            });
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left, Top, Right, Bottom; }

        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] private static extern IntPtr GetShellWindow();

        /// <summary>前台是否是一个全屏窗口（玩游戏/看视频时暂停动效省电）。</summary>
        private bool FullscreenActive()
        {
            try
            {
                IntPtr fg = GetForegroundWindow();
                if (fg == IntPtr.Zero || fg == GetShellWindow()) return false;
                if (_win != null && _win.IsHandleCreated && fg == _win.Handle) return false;
                RECT r;
                if (!GetWindowRect(fg, out r)) return false;
                var scr = Screen.PrimaryScreen.Bounds;
                bool covers = r.Left <= scr.Left + 2 && r.Top <= scr.Top + 2 &&
                              r.Right >= scr.Right - 2 && r.Bottom >= scr.Bottom - 2;
                string title = fg.ToString();
                if (covers && title != _lastForeground)
                {
                    _lastForeground = title;
                    Log.Write("检测到全屏窗口，暂停动效。");
                }
                return covers;
            }
            catch { return false; }
        }

        /* ------------------------------------------------------------ 托盘菜单 */

        private ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip { ShowImageMargin = false };

            var scenes = new[] {
                new { id = "nebula", name = "深空星云" },
                new { id = "fluid",  name = "抽象流体" },
                new { id = "grid",   name = "极简网格" }
            };
            var mScene = new ToolStripMenuItem("场景");
            foreach (var s in scenes)
            {
                var it = new ToolStripMenuItem(s.name) { Tag = s.id, Checked = _st.Scene == s.id };
                it.Click += (o, e) =>
                {
                    _st.Scene = s.id;
                    _st.Save();
                    _win?.Send(new { type = "config", value = new { scene = s.id } });
                    RefreshChecks(menu);
                };
                mScene.DropDownItems.Add(it);
            }
            menu.Items.Add(mScene);

            var accents = new[] {
                new { id = "silver", name = "冷白银" },
                new { id = "gold",   name = "香槟金" },
                new { id = "blue",   name = "深海蓝" },
                new { id = "violet", name = "星云紫" }
            };
            var mAccent = new ToolStripMenuItem("配色");
            foreach (var a in accents)
            {
                var it = new ToolStripMenuItem(a.name) { Tag = a.id, Checked = _st.Accent == a.id };
                it.Click += (o, e) =>
                {
                    _st.Accent = a.id;
                    _st.Save();
                    _win?.Send(new { type = "config", value = new { accent = a.id } });
                    RefreshChecks(menu);
                };
                mAccent.DropDownItems.Add(it);
            }
            menu.Items.Add(mAccent);

            var mInt = new ToolStripMenuItem("动效强度");
            var ints = new[] {
                new { v = 0.7,  name = "舒缓" },
                new { v = 1.0,  name = "标准" },
                new { v = 1.35, name = "强烈" }
            };
            foreach (var i in ints)
            {
                var it = new ToolStripMenuItem(i.name) { Tag = i.v.ToString("0.##"), Checked = Math.Abs(_st.Intensity - i.v) < 0.01 };
                it.Click += (o, e) =>
                {
                    _st.Intensity = i.v;
                    _st.Save();
                    _win?.Send(new { type = "config", value = new { intensity = i.v } });
                    RefreshChecks(menu);
                };
                mInt.DropDownItems.Add(it);
            }
            menu.Items.Add(mInt);

            menu.Items.Add(new ToolStripSeparator());

            var mFps = new ToolStripMenuItem("帧率上限");
            foreach (var f in new[] { 24, 30, 60 })
            {
                var it = new ToolStripMenuItem(f + " 帧") { Tag = f.ToString(), Checked = _st.Fps == f };
                it.Click += (o, e) =>
                {
                    _st.Fps = f;
                    _st.Save();
                    _win?.Send(new { type = "config", value = new { fps = f } });
                    RefreshChecks(menu);
                };
                mFps.DropDownItems.Add(it);
            }
            menu.Items.Add(mFps);

            var mFollow = new ToolStripMenuItem("跟随电脑负载") { Checked = _st.LoadFollow };
            mFollow.Click += (o, e) =>
            {
                _st.LoadFollow = !_st.LoadFollow;
                mFollow.Checked = _st.LoadFollow;
                _st.Save();
                _win?.Send(new { type = "config", value = new { loadFollow = _st.LoadFollow } });
            };
            menu.Items.Add(mFollow);

            var mFull = new ToolStripMenuItem("全屏应用时暂停") { Checked = _st.PausedWhenFullscreen };
            mFull.Click += (o, e) =>
            {
                _st.PausedWhenFullscreen = !_st.PausedWhenFullscreen;
                mFull.Checked = _st.PausedWhenFullscreen;
                _st.Save();
            };
            menu.Items.Add(mFull);

            var mAuto = new ToolStripMenuItem("开机自动启动") { Checked = IsAutoStart() };
            mAuto.Click += (o, e) =>
            {
                bool on = !IsAutoStart();
                SetAutoStart(on);
                mAuto.Checked = on;
                ShowBalloon(on ? "已设置为开机自动启动。" : "已取消开机自动启动。");
            };
            menu.Items.Add(mAuto);

            menu.Items.Add(new ToolStripSeparator());

            var mPause = new ToolStripMenuItem(_st.Paused ? "继续动效" : "暂停动效");
            mPause.Click += (o, e) =>
            {
                _st.Paused = !_st.Paused;
                mPause.Text = _st.Paused ? "继续动效" : "暂停动效";
                _st.Save();
                _win?.Send(new { type = "config", value = new { paused = _st.Paused } });
            };
            menu.Items.Add(mPause);

            var mReload = new ToolStripMenuItem("重新加载画面");
            mReload.Click += (o, e) => _win?.Reload();
            menu.Items.Add(mReload);

            var mLog = new ToolStripMenuItem("打开日志");
            mLog.Click += (o, e) =>
            {
                try { System.Diagnostics.Process.Start("notepad.exe", Log.Path_); } catch { }
            };
            menu.Items.Add(mLog);

            menu.Items.Add(new ToolStripSeparator());

            var mExit = new ToolStripMenuItem("退出 AURA");
            mExit.Click += (o, e) => ExitApp();
            menu.Items.Add(mExit);

            menu.Opening += (o, e) => RefreshChecks(menu);
            return menu;
        }

        private void RefreshChecks(ContextMenuStrip menu)
        {
            foreach (ToolStripMenuItem top in menu.Items)
            {
                if (top.DropDownItems.Count == 0) continue;
                foreach (ToolStripMenuItem it in top.DropDownItems)
                {
                    if (top.Text == "场景") it.Checked = (string)it.Tag == _st.Scene;
                    else if (top.Text == "配色") it.Checked = (string)it.Tag == _st.Accent;
                    else if (top.Text == "动效强度") it.Checked = (string)it.Tag == _st.Intensity.ToString("0.##");
                    else if (top.Text == "帧率上限") it.Checked = (string)it.Tag == _st.Fps.ToString();
                }
            }
        }

        /* ------------------------------------------------------------ 其他 */

        private static Icon LoadIcon()
        {
            try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { return SystemIcons.Application; }
        }

        private void ShowBalloon(string text)
        {
            try
            {
                _tray.BalloonTipTitle = "AURA · 桌面动态背景";
                _tray.BalloonTipText = text;
                _tray.ShowBalloonTip(2500);
            }
            catch { }
        }

        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunName = "AURA_Wallpaper";

        private static bool IsAutoStart()
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunKey, false))
                {
                    var v = k?.GetValue(RunName) as string;
                    return !string.IsNullOrEmpty(v);
                }
            }
            catch { return false; }
        }

        private static void SetAutoStart(bool on)
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (k == null) return;
                    if (on) k.SetValue(RunName, "\"" + Application.ExecutablePath + "\"");
                    else k.DeleteValue(RunName, false);
                }
            }
            catch (Exception ex) { Log.Write("设置开机自启失败：" + ex.Message); }
        }

        private void ExitApp()
        {
            Log.Write("用户退出。");
            try { _tick?.Stop(); _watchdog?.Stop(); } catch { }
            try { _tray.Visible = false; _tray.Dispose(); } catch { }
            try { _load?.Dispose(); } catch { }
            try { _win?.Dispose(); } catch { }
            ExitThread();
        }
    }
}
