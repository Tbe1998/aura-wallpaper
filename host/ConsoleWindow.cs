using System;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AuraWall
{
    /// <summary>全屏监控台窗口：普通可缩放窗口，加载本机 127.0.0.1 上的监控台页面。</summary>
    public sealed class ConsoleWindow : Form
    {
        private readonly WebView2 _web;
        private readonly string _url;

        public ConsoleWindow(string url)
        {
            _url = url;
            Text = "NEXUS 监控台 · AURA";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(1100, 680);
            BackColor = Color.FromArgb(4, 6, 10);
            Icon = LoadIcon();

            _web = new WebView2 { Dock = DockStyle.Fill, BackColor = Color.FromArgb(4, 6, 10) };
            Controls.Add(_web);
            Load += async (s, e) => await InitAsync();
        }

        private static Icon LoadIcon()
        {
            try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { return SystemIcons.Application; }
        }

        private async System.Threading.Tasks.Task InitAsync()
        {
            try
            {
                var userData = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "AURA", "WebView2");
                var env = await CoreWebView2Environment.CreateAsync(null, userData, null);
                await _web.EnsureCoreWebView2Async(env);
                _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                _web.CoreWebView2.Navigate(_url + "console/index.html");
            }
            catch (Exception ex)
            {
                Log.Write("监控台初始化失败：" + ex.Message);
                MessageBox.Show("监控台加载失败：" + ex.Message, "AURA", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
