using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AuraWall
{
    /// <summary>
    /// 壁纸窗口：无边框、不抢焦点，内部承载 WebView2 渲染 WebGL 场景。
    /// </summary>
    public sealed class WallpaperWindow : Form
    {
        private const string VirtualHost = "aura.local";

        private readonly WebView2 _web;
        private readonly bool _windowed;
        private bool _ready;

        public IntPtr HostHandle { get; private set; } = IntPtr.Zero;
        public bool IsReady => _ready;

        /// <summary>页面导航完成并稳定后触发（自检用）。</summary>
        public event Action<string> Ready;

        private static string WebDir =>
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");

        private static string UserDataDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                         "AURA", "WebView2");

        public WallpaperWindow(bool windowed)
        {
            _windowed = windowed;
            Text = "AURA 桌面动态背景";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.Black;
            ShowInTaskbar = windowed;
            AutoScaleMode = AutoScaleMode.None;
            DoubleBuffered = true;
            KeyPreview = false;
            MinimizeBox = false;
            MaximizeBox = false;
            if (windowed)
            {
                Bounds = new Rectangle(80, 80, 1600, 900);
            }
            else
            {
                Bounds = new Rectangle(0, 0, 1, 1);
                Opacity = 0;          // 挂到桌面层之后再显示，避免闪一下
            }

            _web = new WebView2
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Black,
                DefaultBackgroundColor = Color.Black
            };
            Controls.Add(_web);

            if (windowed && false) { }
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x08000000;   // WS_EX_NOACTIVATE：点它也不抢焦点
                cp.ExStyle |= 0x00000080;   // WS_EX_TOOLWINDOW：不出现在 Alt+Tab
                return cp;
            }
        }

        public async Task<bool> InitializeAsync(string url)
        {
            if (!Directory.Exists(WebDir))
            {
                Log.Write("缺少 web 资源目录：" + WebDir);
                return false;
            }

            try
            {
                var available = CoreWebView2Environment.GetAvailableBrowserVersionString();
                if (string.IsNullOrEmpty(available))
                {
                    ShowRuntimeMissing();
                    return false;
                }
                Log.Write("WebView2 运行时版本：" + available);

                Directory.CreateDirectory(UserDataDir);
                var env = await CoreWebView2Environment.CreateAsync(null, UserDataDir, null);
                await _web.EnsureCoreWebView2Async(env);

                var core = _web.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.IsBuiltInErrorPageEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = false;
                core.Settings.IsPasswordAutosaveEnabled = false;
                core.Settings.IsGeneralAutofillEnabled = false;
                core.Settings.IsSwipeNavigationEnabled = false;

                core.SetVirtualHostNameToFolderMapping(
                    VirtualHost, WebDir, CoreWebView2HostResourceAccessKind.Allow);

                core.NavigationCompleted += async (s, e) =>
                {
                    Log.Write("页面导航完成，success=" + e.IsSuccess);
                    if (!e.IsSuccess) return;
                    await Task.Delay(900);
                    _ready = true;
                    try
                    {
                        var state = await core.ExecuteScriptAsync(
                            "JSON.stringify({scenes:(window.AURA?window.AURA.scenes.length:0),state:(window.AURA?window.AURA.state:null)})");
                        Log.Write("页面状态：" + state);
                        Ready?.Invoke(state);
                    }
                    catch (Exception ex) { Log.Write("读取页面状态失败：" + ex.Message); }
                };

                core.ProcessFailed += (s, e) => Log.Write("WebView2 进程异常：" + e.ProcessFailedKind);

                core.Navigate("https://" + VirtualHost + "/index.html" + url);
                return true;
            }
            catch (Exception ex)
            {
                Log.Write("初始化 WebView2 失败：" + ex);
                ShowRuntimeMissing();
                return false;
            }
        }

        private static void ShowRuntimeMissing()
        {
            MessageBox.Show(
                "缺少 Microsoft Edge WebView2 运行时，无法显示动态背景。\n\n" +
                "请安装后再启动（Win10/11 通常已随 Edge 安装）：\n" +
                "https://developer.microsoft.com/microsoft-edge/webview2/\n\n" +
                "选择 “Evergreen Standalone Installer (x64)”。",
                "AURA 需要 WebView2 运行时",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>把窗口挂到桌面图标层下面。</summary>
        public bool AttachToDesktop()
        {
            HostHandle = DesktopHost.Attach(Handle);
            if (HostHandle == IntPtr.Zero) return false;
            if (!_windowed)
            {
                Opacity = 1;
                Log.Write("壁纸已显示。");
            }
            return true;
        }

        public bool HostAlive => DesktopHost.IsAlive(HostHandle);

        public void Send(object payload)
        {
            try
            {
                if (_web.CoreWebView2 == null) return;
                var json = new JavaScriptSerializer().Serialize(payload);
                _web.CoreWebView2.PostWebMessageAsJson(json);
            }
            catch (Exception ex) { Log.Write("发送配置失败：" + ex.Message); }
        }

        public void Reload()
        {
            try { _web.CoreWebView2?.Reload(); } catch { }
        }

        public void ExecuteScript(string js)
        {
            try { _web.CoreWebView2?.ExecuteScriptAsync(js); } catch { }
        }
    }
}
