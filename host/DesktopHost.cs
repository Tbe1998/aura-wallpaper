using System;
using System.Runtime.InteropServices;
using System.Text;

namespace AuraWall
{
    /// <summary>
    /// 把窗口挂到 Windows 桌面壁纸层（图标下面）。
    /// 原理：向 Progman 发送 0x052C 让 Explorer 生成承载壁纸的 WorkerW，
    /// 再把自己的窗口 SetParent 到该 WorkerW 上。
    /// </summary>
    internal static class DesktopHost
    {
        private const uint SMTO_NORMAL = 0x0000;
        private const uint SWP_NOACTIVATE = 0x0010;
        private const uint SWP_SHOWWINDOW = 0x0040;
        private const int SW_SHOW = 5;

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam,
            IntPtr lParam, uint flags, uint timeout, out IntPtr result);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr child, IntPtr parent);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

        [DllImport("user32.dll")]
        private static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int cmd);

        public static bool IsAlive(IntPtr hWnd) => hWnd != IntPtr.Zero && IsWindow(hWnd);

        private static string ClassOf(IntPtr h)
        {
            var sb = new StringBuilder(256);
            GetClassName(h, sb, sb.Capacity);
            return sb.ToString();
        }

        /// <summary>找到承载壁纸的 WorkerW；找不到时退回 Progman。</summary>
        public static IntPtr FindWallpaperHost()
        {
            IntPtr progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero)
            {
                Log.Write("找不到 Progman（Explorer 可能未运行）。");
                return IntPtr.Zero;
            }

            // 触发 Explorer 生成 WorkerW
            IntPtr unused;
            SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), IntPtr.Zero, SMTO_NORMAL, 1000, out unused);
            SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), SMTO_NORMAL, 1000, out unused);

            // 常规做法：带 SHELLDLL_DefView 的窗口之后那个 WorkerW 就是壁纸层
            IntPtr workerw = IntPtr.Zero;
            EnumWindows((h, l) =>
            {
                if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                {
                    IntPtr w = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
                    if (w != IntPtr.Zero) workerw = w;
                }
                return true;
            }, IntPtr.Zero);

            // 兜底：找没有 SHELLDLL_DefView 子窗口的 WorkerW
            if (workerw == IntPtr.Zero)
            {
                EnumWindows((h, l) =>
                {
                    if (ClassOf(h) == "WorkerW" &&
                        FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
                    {
                        IntPtr rc = default(IntPtr);
                        if (GetClientRect(h, out RECT r) && r.Right > 100 && r.Bottom > 100) workerw = h;
                    }
                    return true;
                }, IntPtr.Zero);
            }

            if (workerw == IntPtr.Zero)
            {
                Log.Write("没找到 WorkerW，退回 Progman 附着。");
                return progman;
            }
            return workerw;
        }

        /// <summary>把窗口挂进桌面层并铺满。</summary>
        public static IntPtr Attach(IntPtr child)
        {
            IntPtr host = FindWallpaperHost();
            if (host == IntPtr.Zero) return IntPtr.Zero;

            SetParent(child, host);
            RECT r;
            if (!GetClientRect(host, out r))
            {
                r.Right = ScreenWidth();
                r.Bottom = ScreenHeight();
            }
            int w = Math.Max(200, r.Right - r.Left);
            int h = Math.Max(200, r.Bottom - r.Top);
            SetWindowPos(child, IntPtr.Zero, 0, 0, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            ShowWindow(child, SW_SHOW);
            Log.Write($"已挂到桌面层：host=0x{host.ToInt64():X} size={w}x{h}");
            return host;
        }

        private static int ScreenWidth() =>
            GetSystemMetricsSafe(0);
        private static int ScreenHeight() =>
            GetSystemMetricsSafe(1);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        private static int GetSystemMetricsSafe(int i)
        {
            // 0 = SM_CXSCREEN, 1 = SM_CYSCREEN；取主屏兜底
            return GetSystemMetrics(i);
        }
    }
}
