import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Area, AreaChart, Bar, BarChart, Pie, PieChart as ReChartsPieChart, Cell,
  CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Loader2, Filter, TrendingUp, ShieldCheck, LogOut, Settings, Plus, Trash2, LayoutDashboard, Database, Activity, PieChart, Clock, FileDown, Share2, Globe, FileSpreadsheet, ImageIcon, Users } from "lucide-react";
import { toPng, toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';

import Login from './Login';
import AdminPanel from './AdminPanel';

const API_BASE = (function () {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return "http://localhost:8000/api";
  }
  return `${protocol}//${hostname}:3001/api`;
})();
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const METRICS_OPTIONS = [
  { value: 'clients', label: 'Total Clients' },
  { value: 'health', label: 'Health Distribution' },
  { value: 'state', label: 'Device State' }
];

function SyncProgress({ API_BASE, getHeaders, triggerLoad, externalLoading }) {
  const [status, setStatus] = useState({ is_syncing: false, current_step: "Idle", files_total: 0, files_done: 0, last_message: "" });

  useEffect(() => {
    let interval;
    if (status.is_syncing || externalLoading) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE}/sync-status`, { headers: getHeaders() });
          setStatus(res.data);
          if (!res.data.is_syncing && !externalLoading) clearInterval(interval);
        } catch (e) { clearInterval(interval); }
      }, 1000);
    } else {
      // Poll một lần để lấy message cuối cùng
      axios.get(`${API_BASE}/sync-status`, { headers: getHeaders() }).then(res => setStatus(res.data)).catch(() => { });
    }
    return () => clearInterval(interval);
  }, [status.is_syncing, externalLoading]);

  const progress = status.files_total > 0 ? Math.round((status.files_done / status.files_total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
          <span className={status.is_syncing ? "text-blue-400" : "text-zinc-500"}>
            {status.is_syncing ? status.current_step : "System Ready"}
          </span>
          {status.is_syncing && status.files_total > 0 && (
            <span className="text-zinc-400">{status.files_done}/{status.files_total} files</span>
          )}
        </div>

        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${status.is_syncing ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-emerald-500/30'}`}
            style={{ width: `${status.is_syncing ? (progress || 5) : 100}%` }}
          />
        </div>
      </div>

      <Button
        onClick={triggerLoad}
        disabled={status.is_syncing || externalLoading}
        className={`w-full font-black text-[10px] tracking-[0.1em] h-10 transition-all ${status.is_syncing
          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          : 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-600/30 hover:border-emerald-500 shadow-lg shadow-emerald-500/5'
          }`}
      >
        {status.is_syncing ? "SYNC IN PROGRESS..." : "FORCE CLOUD REFRESH"}
      </Button>

      {status.last_message && !status.is_syncing && (
        <p className="text-[9px] text-center font-bold text-zinc-500 uppercase italic tracking-wider animate-pulse">
          Last: {status.last_message}
        </p>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [widgets, setWidgets] = useState([]);
  const [siteMap, setSiteMap] = useState({ "All Sites": ["All Devices"] });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [enabledMetrics, setEnabledMetrics] = useState(['clients', 'health', 'state']);
  const [summaryData, setSummaryData] = useState({ connectivity: "0%", alerts: 0, total_clients: 0 });
  const [currentSummarySite, setCurrentSummarySite] = useState("Global Overview");

  const [newWidgetForm, setNewWidgetForm] = useState({
    title: "New Analytics",
    site: "All Sites",
    device: "All Devices",
    metric: "clients",
    type: "area",
    timeRange: "24" // Default to 24h
  });

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      const u = JSON.parse(saved);
      setUser(u);
      setIsAdmin(u.role === "admin");
    }
    // Load Global Settings
    axios.get(`${API_BASE}/settings`).then(res => {
      if (res.data.enabled_metrics) setEnabledMetrics(res.data.enabled_metrics);
    }).catch(() => { });
  }, []);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const handleLoad = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/load`, null, { headers: getHeaders() });
      const newMap = res.data.site_map;
      setSiteMap(newMap);
      setWidgets(res.data.dashboard || []);
      setSummaryData(res.data.summary || { connectivity: "0%", alerts: 0, total_clients: 0 });
      setStatus(res.data.message);
      setRefreshTrigger(prev => prev + 1);

      if (newMap && !newMap["All Sites"] && Object.keys(newMap).length > 0) {
        setNewWidgetForm(prev => ({ ...prev, site: Object.keys(newMap)[0] }));
      }
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    }
    setLoading(false);
  };

  const fetchSummary = async (siteName) => {
    try {
      const res = await axios.get(`${API_BASE}/summary`, {
        params: { site: siteName },
        headers: getHeaders()
      });
      setSummaryData(res.data);
      setCurrentSummarySite(siteName === "All Sites" ? "Global Overview" : siteName);
    } catch (err) { }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    setIsAdmin(false);
    setShowAdminPanel(false);
  };

  const addWidget = async () => {
    const widget = { ...newWidgetForm, id: Date.now().toString() };
    const updated = [...widgets, widget];
    setWidgets(updated);
    await axios.post(`${API_BASE}/user/dashboard`, { config: updated }, { headers: getHeaders() });
  };

  const updateWidgetTime = async (id, time) => {
    const updated = widgets.map(w => w.id === id ? { ...w, timeRange: time } : w);
    setWidgets(updated);
    await axios.post(`${API_BASE}/user/dashboard`, { config: updated }, { headers: getHeaders() });
  };

  const removeWidget = async (id) => {
    const updated = widgets.filter(w => w.id !== id);
    setWidgets(updated);
    await axios.post(`${API_BASE}/user/dashboard`, { config: updated }, { headers: getHeaders() });
  };

  useEffect(() => { if (user) handleLoad(); }, [user]);

  const generateReport = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) {
      alert("Không tìm thấy nội dung Dashboard để xuất!");
      return;
    }

    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const canvas = await toCanvas(element, {
        backgroundColor: '#000000',
        pixelRatio: 2,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(imgData);
      const margin = 10;
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = (imgProps.height * contentWidth) / imgProps.width;

      // Header and Footer heights in mm
      const headerHeight = 35;
      const footerHeight = 15;
      const usablePageHeight = pdfHeight - headerHeight - footerHeight - (margin * 2);

      let heightLeft = contentHeight;
      let position = 0;
      let pageNumber = 1;

      const addDecoration = (pageNo, totalPages) => {
        // Header Background
        pdf.setFillColor(15, 15, 15);
        pdf.rect(0, 0, pdfWidth, headerHeight, 'F');

        // Brand Logo
        pdf.setFillColor(37, 99, 235);
        pdf.roundedRect(10, 8, 12, 12, 2, 2, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text("HPE", 11.5, 15.5);

        // Title
        pdf.setFontSize(14);
        pdf.text("INFRASTRUCTURE ANALYTICS REPORT", 28, 14);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(150, 150, 150);
        pdf.text("Network Performance & Insights", 28, 19);

        // Metadata box
        pdf.setFillColor(30, 30, 30);
        pdf.roundedRect(pdfWidth - 65, 8, 55, 15, 2, 2, 'F');
        pdf.setTextColor(200, 200, 200);
        pdf.setFontSize(6);
        pdf.text(`OPERATOR: ${user.username.toUpperCase()}`, pdfWidth - 62, 13);
        pdf.text(`TOTAL PAGES: ${totalPages}`, pdfWidth - 62, 18);

        // Accent line
        pdf.setDrawColor(37, 99, 235);
        pdf.setLineWidth(0.5);
        pdf.line(0, headerHeight, pdfWidth, headerHeight);

        // Footer Background
        pdf.setFillColor(15, 15, 15);
        pdf.rect(0, pdfHeight - footerHeight, pdfWidth, footerHeight, 'F');
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(6);
        const footerCenter = pdfWidth / 2;
        pdf.text("© 2024 HPE INSIGHTS - AIO REPORTING SYSTEM", footerCenter, pdfHeight - 6, { align: 'center' });
        pdf.text("CONFIDENTIAL", 10, pdfHeight - 6);
        pdf.text(`PAGE ${pageNo} / ${totalPages}`, pdfWidth - 10, pdfHeight - 6, { align: 'right' });
      };

      // Calculate how many pixels on the canvas correspond to the usablePageHeight (mm)
      // (scale factor = canvas.width / contentWidth)
      const pxPerMm = canvas.width / contentWidth;
      const canvasPageHeight = usablePageHeight * pxPerMm;
      const totalPages = Math.ceil(canvas.height / canvasPageHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        addDecoration(i + 1, totalPages);

        // Slice the canvas to get only the part for this page
        const sourceY = i * canvasPageHeight;
        const sourceHeight = Math.min(canvas.height - sourceY, canvasPageHeight);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = sourceHeight;

        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

        const pageImgData = tempCanvas.toDataURL('image/png');
        const drawHeight = (sourceHeight * contentWidth) / canvas.width;

        pdf.addImage(pageImgData, 'PNG', margin, headerHeight + margin, contentWidth, drawHeight);
      }

      pdf.save(`HPE_Report_${user.username}_${new Date().toISOString().split('T')[0]}.pdf`);
      if (totalPages > 1) {
        alert(`Đã tạo báo cáo gồm ${totalPages} trang.`);
      }
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("Lỗi xuất PDF: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsImage = async (elementId = 'dashboard-content', fileName = 'HPE_Dashboard') => {
    const element = document.getElementById(elementId);
    if (!element) {
      alert("Không tìm thấy nội dung để xuất ảnh!");
      return;
    }

    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const dataUrl = await toPng(element, {
        backgroundColor: '#000000',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `${fileName}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Image export failed:", err);
      alert("Lỗi xuất ảnh: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!user) return <Login onLoginSuccess={(u) => { setUser(u); setIsAdmin(u.role === 'admin'); }} />;

  return (
    <div className="min-h-screen bg-black text-zinc-50 p-4 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white flex items-center gap-3">
              <span className="p-2 bg-blue-600 rounded-xl shadow-lg">HPE</span> INSIGHTS
            </h1>
            <p className="text-zinc-400 font-medium uppercase text-[10px] tracking-widest flex items-center gap-2">
              <Database className="w-3 h-3 text-blue-500" /> {user.username} Dashboard
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {isAdmin && (
              <Button variant="outline" onClick={() => setShowAdminPanel(!showAdminPanel)} className="flex-1 md:flex-none border-zinc-800 text-zinc-100 hover:bg-zinc-800 rounded-full h-10 px-4 font-bold text-xs">
                <Settings className="w-4 h-4 md:mr-2" /> <span className="hidden sm:inline">{showAdminPanel ? "CLOSE ADMIN" : "ADMIN PANEL"}</span>
              </Button>
            )}
            {!showAdminPanel && (
              <div className="flex gap-2">
                <Button onClick={generateReport} disabled={isExporting} className="flex-1 md:flex-none bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 border border-blue-600/30 hover:border-blue-500 rounded-full h-10 px-4 font-bold text-xs shadow-lg shadow-blue-500/5">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 md:mr-2" />}
                  <span className="hidden sm:inline">PDF</span>
                </Button>
                <Button onClick={() => exportAsImage()} disabled={isExporting} className="flex-1 md:flex-none bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-600/30 hover:border-emerald-500 rounded-full h-10 px-4 font-bold text-xs shadow-lg shadow-emerald-500/5">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4 md:mr-2" />}
                  <span className="hidden sm:inline">IMAGE</span>
                </Button>
              </div>
            )}
            <Button onClick={handleLogout} variant="destructive" className="flex-1 md:flex-none rounded-full h-10 px-4 font-bold shadow-lg shadow-red-500/10 text-xs text-white">
              <LogOut className="w-4 h-4 md:mr-2" /> <span className="hidden sm:inline">LOGOUT</span>
            </Button>
          </div>
        </header>

        {showAdminPanel ? (
          <AdminPanel
            onBack={() => setShowAdminPanel(false)}
            allSites={Object.keys(siteMap)}
            enabledMetrics={enabledMetrics}
            setEnabledMetrics={setEnabledMetrics}
            METRICS_OPTIONS={METRICS_OPTIONS}
            API_BASE={API_BASE}
            getHeaders={getHeaders}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            <div className="lg:col-span-3 space-y-6">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xs font-black text-zinc-400 flex items-center gap-2 uppercase tracking-widest">
                    <Plus className="w-4 h-4 text-emerald-500" /> Assemble Widget
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Site</label>
                      <Select
                        value={newWidgetForm.site}
                        onValueChange={v => setNewWidgetForm({ ...newWidgetForm, site: v, device: "All Devices" })}
                        disabled={Object.keys(siteMap).length <= 1}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9 text-xs font-bold text-zinc-200 disabled:opacity-80">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {Object.keys(siteMap).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Device</label>
                      <Select
                        value={newWidgetForm.device}
                        onValueChange={v => setNewWidgetForm({ ...newWidgetForm, device: v })}
                        disabled={(siteMap[newWidgetForm.site] || []).length <= 1}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9 text-xs font-bold text-zinc-200 disabled:opacity-80">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {(siteMap[newWidgetForm.site] || ["All Devices"]).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Metric</label>
                      <Select value={newWidgetForm.metric} onValueChange={v => {
                        const type = v === 'clients' ? 'area' : 'pie';
                        setNewWidgetForm({ ...newWidgetForm, metric: v, type });
                      }}>
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9 text-xs font-bold text-zinc-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {METRICS_OPTIONS.filter(m => enabledMetrics.includes(m.value)).map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={addWidget} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 mt-2 text-xs">ADD TO DASHBOARD</Button>
                  </div>
                </CardContent>
              </Card>

              {isAdmin && (
                <Card className="bg-zinc-900 border-zinc-800 ring-1 ring-zinc-800 shadow-2xl overflow-hidden">
                  <CardHeader className="pb-3 border-b border-zinc-800 bg-zinc-800/20">
                    <CardTitle className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center justify-between">
                      Infrastructure Sync
                      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-5 space-y-4">
                    <SyncProgress API_BASE={API_BASE} getHeaders={getHeaders} triggerLoad={handleLoad} externalLoading={loading} />
                  </CardContent>
                </Card>
              )}
              {status && <div className="text-[9px] text-zinc-500 font-mono italic text-center animate-pulse tracking-wide uppercase">{status}</div>}
            </div>

            <div id="dashboard-content" className="lg:col-span-9 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <Select
                    value={currentSummarySite === "Global Overview" ? "All Sites" : currentSummarySite}
                    onValueChange={(v) => fetchSummary(v)}
                  >
                    <SelectTrigger className="bg-transparent border-none p-0 h-auto text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      {Object.keys(siteMap).map(s => (
                        <SelectItem key={s} value={s} className="text-[10px] uppercase font-bold">{s === "All Sites" ? "Global Overview" : s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-[8px] font-bold text-zinc-600 uppercase tabular-nums">Refreshed: {new Date().toLocaleTimeString()}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                {[
                  { label: "Total Clients", value: (summaryData.total_clients || 0).toLocaleString(), icon: Users, color: "text-blue-500", detail: "Active Sessions" },
                  {
                    label: "Connectivity",
                    value: summaryData.connectivity,
                    icon: Activity,
                    color: parseFloat(summaryData.connectivity) < 70 ? "text-red-500" : parseFloat(summaryData.connectivity) < 90 ? "text-amber-500" : "text-emerald-500",
                    detail: "Network Health"
                  },
                  { label: "Total Alerts", value: summaryData.alerts, icon: ShieldCheck, color: summaryData.alerts > 0 ? "text-red-500" : "text-amber-500", detail: "Issues Found" },
                ].map((stat, i) => (
                  <Card key={i} className="bg-zinc-900 border-zinc-800/50 shadow-lg overflow-hidden group hover:border-zinc-700 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                        <p className="text-xl md:text-2xl font-black text-white">{stat.value}</p>
                        <p className="text-[8px] font-bold text-zinc-600 uppercase mt-1">{stat.detail}</p>
                      </div>
                      <div className={`p-3 rounded-xl bg-zinc-800/50 group-hover:scale-110 transition-transform ${stat.color} shadow-inner`}>
                        <stat.icon className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {widgets.map(w => (
                  <div key={w.id} className="lg:col-span-1">
                    <WidgetCard
                      widget={w}
                      refreshTrigger={refreshTrigger}
                      onRemove={() => removeWidget(w.id)}
                      onUpdateTime={(time) => updateWidgetTime(w.id, time)}
                      onSummaryUpdate={(site, data) => {
                        if (data) {
                          setSummaryData(data);
                          setCurrentSummarySite(site === "All Sites" ? "Global Overview" : site);
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TIME_OPTIONS = [
  { label: "Tất cả", value: "0" },
  { label: "1 giờ", value: "1" },
  { label: "4 giờ", value: "4" },
  { label: "12 giờ", value: "12" },
  { label: "1 ngày", value: "24" },
  { label: "3 ngày", value: "72" },
  { label: "7 ngày", value: "168" },
];

function WidgetCard({ widget, onRemove, onUpdateTime, refreshTrigger, onSummaryUpdate }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const timeRange = widget.timeRange || "24";

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/analyze`, {
        site: widget.site,
        device: widget.device,
        metric: widget.metric,
        hours: timeRange === "0" ? null : parseInt(timeRange)
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      setData(res.data.data || []);
      if (res.data.summary && onSummaryUpdate) {
        onSummaryUpdate(widget.site, res.data.summary);
      }
    } catch (err) { }
    setLoading(false);
  };

  const exportCSV = () => {
    if (!data || data.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    // Header
    const headers = Object.keys(data[0]);
    csvContent += headers.join(",") + "\n";

    // Rows
    data.forEach(row => {
      csvContent += headers.map(h => row[h]).join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${widget.site}_${widget.metric}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [widget, timeRange, refreshTrigger]);

  const exportWidgetAsImage = async () => {
    const element = document.getElementById(`widget-${widget.id}`);
    if (!element) {
      alert("Không tìm thấy biểu đồ để xuất!");
      return;
    }

    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(element, {
        backgroundColor: '#18181b', // zinc-900
        quality: 1,
        pixelRatio: 3,
        // Loại bỏ các nút interactive trước khi chụp (filter out icons)
        filter: (node) => {
          if (node.tagName === 'BUTTON' || (node.classList && node.classList.contains('lucide'))) {
            // Do not include buttons or icons in the export
            // but actually we already use data-html2canvas-ignore (though toPng doesn't support it by default)
            // So we rely on standard CSS hiding if needed
          }
          return true;
        }
      });

      const link = document.createElement('a');
      link.download = `HPE_${widget.site}_${widget.metric}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      alert("Lỗi xuất ảnh biểu đồ: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card id={`widget-${widget.id}`} className="bg-zinc-900 border-zinc-800 shadow-xl relative group overflow-hidden">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-[10px] md:text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 pr-8">
            {widget.metric === 'clients' ? <TrendingUp className="w-3 h-3 text-blue-500" /> : <PieChart className="w-3 h-3 text-emerald-500" />}
            <span className="truncate">{widget.site} {widget.device !== 'All Devices' ? `- ${widget.device}` : ''} - {widget.metric.toUpperCase()}</span>
          </CardTitle>
          <div className="absolute top-4 right-4 flex items-center gap-2" data-html2canvas-ignore>
            <button onClick={exportWidgetAsImage} title="Export Image" className="text-zinc-700 hover:text-blue-500 transition-all">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <ImageIcon className="w-4 h-4" />}
            </button>
            <button onClick={exportCSV} title="Export CSV" className="text-zinc-700 hover:text-emerald-500 transition-all">
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button onClick={onRemove} title="Remove Widget" className="text-zinc-700 hover:text-red-500 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div data-html2canvas-ignore className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-zinc-500" />
          <div className="flex flex-wrap gap-1">
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onUpdateTime(opt.value)}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition-all ${timeRange === opt.value
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[250px] flex items-center justify-center p-4">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-zinc-800" /> : data.length === 0 ? (
          <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">No Data Available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {widget.type === 'area' ? (
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="colorG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickFormatter={(val) => {
                    const [date, time] = val.split(' ');
                    if (!date || !time) return val;
                    const [y, m, d] = date.split('-');
                    return parseInt(timeRange) > 24 ? `${d}/${m} ${time}` : time;
                  }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px', color: '#fff' }}
                  itemStyle={{ color: '#3b82f6' }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area type="natural" dataKey="clients" stroke="#3b82f6" fillOpacity={1} fill="url(#colorG)" strokeWidth={2} />
              </AreaChart>
            ) : (
              <ReChartsPieChart>
                <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px', color: '#fff' }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Legend wrapperStyle={{ fontSize: '9px' }} />
              </ReChartsPieChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default App;
