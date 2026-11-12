using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Net.NetworkInformation;
using System.Text;
using System.Runtime.InteropServices;

namespace AuraWall
{
    /// <summary>
    /// 真实系统采样：CPU（总体/每核/进程增量）、内存、GPU 引擎、网络、进程线程与上下文切换。
    /// 只读取统计量，不读取文件内容、命令行、窗口标题等隐私信息。
    /// </summary>
    public sealed class Sampler : IDisposable
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

        private sealed class ProcSample
        {
            public string Name;
            public int Pid;
            public double CpuPct;
            public long WorkSet;
            public int Threads;
            public TimeSpan LastCpu;
            public DateTime LastSeen;
            public double MemDelta;
        }

        private readonly int _cores;
        private readonly List<PerformanceCounter> _coreCounters = new List<PerformanceCounter>();
        private readonly PerformanceCounter _cpuTotal;
        private readonly PerformanceCounter _ctxSwitches;
        private readonly Dictionary<int, ProcSample> _procs = new Dictionary<int, ProcSample>();
        private readonly HashSet<int> _seenThisTick = new HashSet<int>();

        private long _lastRx, _lastTx, _lastRxPkts, _lastTxPkts;
        private DateTime _lastAt = DateTime.UtcNow;
        private long _seq;
        private double _lastCpuPct;
        private bool _gpuAvailable = true;
        private string _netIface = "--";

        public long Seq => _seq;

        public Sampler()
        {
            _cores = Environment.ProcessorCount;
            try { _cpuTotal = new PerformanceCounter("Processor", "% Processor Time", "_Total", true); _cpuTotal.NextValue(); }
            catch (Exception ex) { Log.Write("CPU 计数器不可用：" + ex.Message); }

            for (int i = 0; i < _cores; i++)
            {
                try
                {
                    var c = new PerformanceCounter("Processor", "% Processor Time", i.ToString(), true);
                    c.NextValue();
                    _coreCounters.Add(c);
                }
                catch { /* 某些核心不可读就跳过 */ }
            }

            try { _ctxSwitches = new PerformanceCounter("System", "Context Switches/sec", true); _ctxSwitches.NextValue(); }
            catch { }

            _lastRx = TotalBytes(false);
            _lastTx = TotalBytes(true);
            _lastRxPkts = TotalPackets(false);
            _lastTxPkts = TotalPackets(true);
        }

        /* ---------------------------------------------------------------- 网络 */

        private static IEnumerable<NetworkInterface> ActiveIfaces()
        {
            NetworkInterface[] all;
            try { all = NetworkInterface.GetAllNetworkInterfaces(); }
            catch { yield break; }

            foreach (var ni in all)
            {
                try
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                    yield return ni;
                }
                catch { }
            }
        }

        private static long TotalBytes(bool sent)
        {
            long sum = 0;
            foreach (var ni in ActiveIfaces())
            {
                try
                {
                    var s = ni.GetIPv4Statistics();
                    sum += sent ? s.BytesSent : s.BytesReceived;
                }
                catch { }
            }
            return sum;
        }

        private static long TotalPackets(bool sent)
        {
            long sum = 0;
            foreach (var ni in ActiveIfaces())
            {
                try
                {
                    var s = ni.GetIPv4Statistics();
                    sum += sent ? s.UnicastPacketsSent : s.UnicastPacketsReceived;
                }
                catch { }
            }
            return sum;
        }

        /* ---------------------------------------------------------------- GPU */

        private List<KeyValuePair<string, double>> GpuEngines()
        {
            var best = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var cat = new PerformanceCounterCategory("GPU Engine");
                var inst = cat.GetInstanceNames();
                if (inst.Length == 0) { _gpuAvailable = false; return new List<KeyValuePair<string, double>>(); }

                foreach (var name in inst)
                {
                    // 例：pid_1234_luid_0x00000000_0x0000ABCD_phys_0_eng_3_engtype_3D
                    int idx = name.LastIndexOf("engtype_", StringComparison.OrdinalIgnoreCase);
                    if (idx < 0) continue;
                    string type = name.Substring(idx + 8);
                    if (type.Length == 0) continue;

                    try
                    {
                        using (var pc = new PerformanceCounter("GPU Engine", "Utilization Percentage", name, true))
                        {
                            double v = pc.NextValue();
                            double cur;
                            if (!best.TryGetValue(type, out cur)) cur = 0;
                            if (v > cur) best[type] = v;   // 同一引擎类型取最繁忙进程的占用
                        }
                    }
                    catch { }
                }
                _gpuAvailable = best.Count > 0;
            }
            catch
            {
                _gpuAvailable = false;
            }

            return best.OrderByDescending(kv => kv.Value).Take(5).ToList();
        }

        /* ---------------------------------------------------------------- 采样 */

        public string SampleJson()
        {
            var now = DateTime.UtcNow;
            double secs = Math.Max(0.2, (now - _lastAt).TotalSeconds);
            _lastAt = now;
            _seq++;

            /* CPU */
            double cpuPct = 0;
            try { if (_cpuTotal != null) cpuPct = Math.Max(0, Math.Min(100, _cpuTotal.NextValue())); }
            catch { }
            _lastCpuPct = _lastCpuPct * 0.4 + cpuPct * 0.6;

            var perCore = new List<double>();
            foreach (var c in _coreCounters)
            {
                try { perCore.Add(Math.Round(Math.Max(0, Math.Min(100, c.NextValue())), 1)); }
                catch { perCore.Add(0); }
            }

            /* 内存 */
            double memTotal = 0, memUsed = 0, memPct = 0;
            try
            {
                var m = new MEMORYSTATUSEX();
                if (GlobalMemoryStatusEx(m))
                {
                    memTotal = m.ullTotalPhys;
                    memUsed = m.ullTotalPhys - m.ullAvailPhys;
                    memPct = m.dwMemoryLoad;
                }
            }
            catch { }

            /* 进程（CPU 增量 + 工作集） */
            var procs = new List<ProcSample>();
            _seenThisTick.Clear();
            int totalThreads = 0;
            try
            {
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        int pid = p.Id;
                        _seenThisTick.Add(pid);

                        ProcSample rec;
                        if (!_procs.TryGetValue(pid, out rec))
                        {
                            rec = new ProcSample { Pid = pid, LastCpu = TimeSpan.Zero };
                            _procs[pid] = rec;
                        }

                        string name;
                        try { name = p.ProcessName; } catch { name = "?"; }

                        TimeSpan cpuTime = TimeSpan.Zero;
                        long ws = 0;
                        int threads = 0;
                        try { cpuTime = p.TotalProcessorTime; } catch { }
                        try { ws = p.WorkingSet64; } catch { }
                        try { threads = p.Threads.Count; } catch { }

                        double pct = 0;
                        try
                        {
                            pct = (cpuTime - rec.LastCpu).TotalMilliseconds / (secs * 1000.0 * _cores) * 100.0;
                        }
                        catch { }
                        rec.LastCpu = cpuTime;

                        rec.MemDelta = ws - rec.WorkSet;
                        rec.Name = name;
                        rec.Pid = pid;
                        rec.WorkSet = ws;
                        rec.Threads = threads;
                        rec.CpuPct = Math.Max(0, Math.Min(100, pct));
                        rec.LastSeen = now;
                        totalThreads += threads;
                        procs.Add(rec);
                    }
                    catch { }
                    finally { try { p.Dispose(); } catch { } }
                }
            }
            catch { }

            // 清理已退出进程；PID 复用由 LastCpu 归零自然处理
            var dead = _procs.Values.Where(v => !_seenThisTick.Contains(v.Pid)).Select(v => v.Pid).ToList();
            foreach (var id in dead) _procs.Remove(id);

            var topCpu = procs.OrderByDescending(x => x.CpuPct).Take(6).ToList();
            var topMem = procs.OrderByDescending(x => x.WorkSet).Take(6).ToList();

            /* 网络 */
            long rx = TotalBytes(false), tx = TotalBytes(true);
            long rp = TotalPackets(false), tp = TotalPackets(true);
            double rxRate = Math.Max(0, rx - _lastRx) / secs / 1024.0;   // KiB/s
            double txRate = Math.Max(0, tx - _lastTx) / secs / 1024.0;
            double rxPkt = Math.Max(0, rp - _lastRxPkts) / secs;
            double txPkt = Math.Max(0, tp - _lastTxPkts) / secs;
            _lastRx = rx; _lastTx = tx; _lastRxPkts = rp; _lastTxPkts = tp;

            try { _netIface = ActiveIfaces().FirstOrDefault()?.Name ?? "--"; } catch { }

            /* 上下文切换 */
            double ctx = 0;
            try { if (_ctxSwitches != null) ctx = _ctxSwitches.NextValue(); } catch { }

            var gpu = GpuEngines();
            double gpuPct = gpu.Count > 0 ? Math.Round(gpu[0].Value, 1) : 0;

            var sb = new StringBuilder(2048);
            sb.Append('{');
            sb.Append("\"seq\":").Append(_seq).Append(',');
            sb.Append("\"ts\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Append(',');

            sb.Append("\"cpu\":{\"pct\":").Append(N(cpuPct, 1)).Append(",\"cores\":");
            sb.Append('[').Append(string.Join(",", perCore.Select(v => N(v, 1)))).Append(']');
            sb.Append(",\"procs\":[");
            sb.Append(string.Join(",", topCpu.Select(p =>
                "{\"name\":\"" + Esc(p.Name) + "\",\"pid\":" + p.Pid +
                ",\"cpu\":" + N(p.CpuPct, 1) + ",\"ws\":" + p.WorkSet + ",\"threads\":" + p.Threads + "}")));
            sb.Append("]},");

            sb.Append("\"mem\":{\"total\":").Append((long)memTotal)
              .Append(",\"used\":").Append((long)memUsed)
              .Append(",\"avail\":").Append((long)(memTotal - memUsed))
              .Append(",\"pct\":").Append(N(memPct, 1))
              .Append(",\"procs\":[");
            sb.Append(string.Join(",", topMem.Select(p =>
                "{\"name\":\"" + Esc(p.Name) + "\",\"pid\":" + p.Pid + ",\"ws\":" + p.WorkSet + "}")));
            sb.Append("]},");

            sb.Append("\"gpu\":{\"pct\":").Append(N(gpuPct, 1))
              .Append(",\"available\":").Append(_gpuAvailable ? "true" : "false")
              .Append(",\"engines\":[");
            sb.Append(string.Join(",", gpu.Select(kv =>
                "{\"name\":\"" + Esc(kv.Key) + "\",\"util\":" + N(kv.Value, 1) + "}")));
            sb.Append("]},");

            sb.Append("\"net\":{\"down\":").Append(N(rxRate, 1))
              .Append(",\"up\":").Append(N(txRate, 1))
              .Append(",\"downPkts\":").Append(N(rxPkt, 1))
              .Append(",\"upPkts\":").Append(N(txPkt, 1))
              .Append(",\"iface\":\"").Append(Esc(_netIface)).Append("\"},");

            sb.Append("\"sys\":{\"procCount\":").Append(procs.Count)
              .Append(",\"threadCount\":").Append(totalThreads)
              .Append(",\"ctx\":").Append(N(ctx, 0))
              .Append(",\"cores\":").Append(_cores)
              .Append(",\"host\":\"").Append(Esc(Environment.MachineName)).Append("\"},");

            sb.Append("\"os\":\"").Append(Esc(Environment.OSVersion.VersionString)).Append("\"");
            sb.Append('}');
            return sb.ToString();
        }

        private static string N(double v, int digits)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return "0";
            return Math.Round(v, digits).ToString(CultureInfo.InvariantCulture);
        }

        private static string Esc(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        public void Dispose()
        {
            try { _cpuTotal?.Dispose(); } catch { }
            foreach (var c in _coreCounters) { try { c.Dispose(); } catch { } }
            try { _ctxSwitches?.Dispose(); } catch { }
        }
    }
}
