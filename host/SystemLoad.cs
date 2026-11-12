using System;
using System.Diagnostics;
using System.Globalization;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;

namespace AuraWall
{
    /// <summary>真实负载采样：CPU、内存、网络，合成 0..1 的负载系数。</summary>
    public sealed class SystemLoad : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)]
        private class MEMORYSTATUSEX
        {
            public uint dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
            public uint dwMemoryLoad;
            public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile,
                         ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX buf);

        private PerformanceCounter _cpu;
        private bool _cpuBroken;
        private long _lastRx, _lastTx;
        private DateTime _lastAt;
        private double _netNorm;

        public double Cpu { get; private set; }
        public double Mem { get; private set; }
        public double Load { get; private set; }

        public SystemLoad()
        {
            try
            {
                _cpu = new PerformanceCounter("Processor", "% Processor Time", "_Total", true);
                _cpu.NextValue(); // 第一次无意义
            }
            catch (Exception ex)
            {
                _cpuBroken = true;
                Log.Write("CPU 计数器不可用：" + ex.Message);
            }
            _lastAt = DateTime.UtcNow;
            _lastRx = TotalBytes(false);
            _lastTx = TotalBytes(true);
        }

        private static long TotalBytes(bool sent)
        {
            long sum = 0;
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    try
                    {
                        var s = ni.GetIPv4Statistics();
                        sum += sent ? s.BytesSent : s.BytesReceived;
                    }
                    catch { }
                }
            }
            catch { }
            return sum;
        }

        public void Tick()
        {
            if (!_cpuBroken && _cpu != null)
            {
                try { Cpu = Math.Max(0, Math.Min(1, _cpu.NextValue() / 100.0)); }
                catch { _cpuBroken = true; }
            }

            try
            {
                var m = new MEMORYSTATUSEX();
                if (GlobalMemoryStatusEx(m)) Mem = m.dwMemoryLoad / 100.0;
            }
            catch { }

            var now = DateTime.UtcNow;
            double secs = Math.Max(0.2, (now - _lastAt).TotalSeconds);
            long rx = TotalBytes(false), tx = TotalBytes(true);
            double rxRate = Math.Max(0, rx - _lastRx) / secs;
            double txRate = Math.Max(0, tx - _lastTx) / secs;
            _lastRx = rx; _lastTx = tx; _lastAt = now;

            // 网络用对数压缩：几十 KB/s 就能看出来，几百 MB/s 也不会爆表
            double bytes = rxRate + txRate;
            double n = Math.Log(1 + bytes / 8192.0) / Math.Log(1 + 10485760.0 / 8192.0);
            _netNorm = Math.Max(0, Math.Min(1, n));

            double target = Math.Max(0, Math.Min(1, Cpu * 0.55 + Mem * 0.25 + _netNorm * 0.20));
            Load = Load * 0.55 + target * 0.45;   // 平滑，避免跳变
        }

        public string Json()
        {
            return string.Format(CultureInfo.InvariantCulture,
                "{{\"load\":{0:0.###},\"cpu\":{1:0.###},\"mem\":{2:0.###}}}",
                Load, Cpu, Mem);
        }

        public void Dispose()
        {
            try { _cpu?.Dispose(); } catch { }
        }
    }
}
