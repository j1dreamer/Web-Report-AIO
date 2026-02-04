import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Area, AreaChart, Bar, BarChart, Pie, PieChart as ReChartsPieChart, Cell,
  CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Loader2, Filter, TrendingUp, ShieldCheck, LogOut, Settings, Plus, Trash2, LayoutDashboard, Database, Activity, PieChart, Clock } from "lucide-react";

import Login from './Login';
import AdminPanel from './AdminPanel';

const API_BASE = "http://127.0.0.1:8000/api";
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [widgets, setWidgets] = useState([]);
  const [siteMap, setSiteMap] = useState({ "All Sites": ["All Devices"] });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [timeRange, setTimeRange] = useState("0");

  const [newWidgetForm, setNewWidgetForm] = useState({
    title: "New Analytics",
    site: "All Sites",
    device: "All Devices",
    metric: "clients",
    type: "area"
  });

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      const u = JSON.parse(saved);
      setUser(u);
      setIsAdmin(u.role === "admin");
    }
  }, []);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const handleLoad = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/load`, null, { headers: getHeaders() });
      setSiteMap(res.data.site_map);
      setWidgets(res.data.dashboard || []);
      setStatus(res.data.message);
    } catch (err) {
      if (err.response?.status === 401) handleLogout();
    }
    setLoading(false);
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

  const removeWidget = async (id) => {
    const updated = widgets.filter(w => w.id !== id);
    setWidgets(updated);
    await axios.post(`${API_BASE}/user/dashboard`, { config: updated }, { headers: getHeaders() });
  };

  useEffect(() => { if (user) handleLoad(); }, [user]);

  if (!user) return <Login onLoginSuccess={(u) => { setUser(u); setIsAdmin(u.role === 'admin'); }} />;

  return (
    <div className="min-h-screen bg-black text-zinc-50 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
              <span className="p-2 bg-blue-600 rounded-xl shadow-lg">HPE</span> INSIGHTS
            </h1>
            <p className="text-zinc-400 font-medium uppercase text-[10px] tracking-widest flex items-center gap-2">
              <Database className="w-3 h-3 text-blue-500" /> {user.username} Dashboard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 rounded-full h-10 px-4 font-bold text-xs text-white">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <SelectValue placeholder="Time Range" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                <SelectItem value="0">Tất cả thời gian</SelectItem>
                <SelectItem value="1">1 giờ qua</SelectItem>
                <SelectItem value="4">4 giờ qua</SelectItem>
                <SelectItem value="6">6 giờ qua</SelectItem>
                <SelectItem value="12">12 giờ qua</SelectItem>
                <SelectItem value="24">24 giờ qua</SelectItem>
              </SelectContent>
            </Select>

            {isAdmin && (
              <Button variant="outline" onClick={() => setShowAdminPanel(!showAdminPanel)} className="border-zinc-800 text-zinc-100 hover:bg-zinc-800 rounded-full h-10 px-4 font-bold">
                <Settings className="w-4 h-4 mr-2" /> {showAdminPanel ? "CLOSE ADMIN" : "ADMIN PANEL"}
              </Button>
            )}
            <Button onClick={handleLogout} variant="destructive" className="rounded-full h-10 px-4 font-bold shadow-lg shadow-red-500/10">
              <LogOut className="w-4 h-4 mr-2" /> LOGOUT
            </Button>
          </div>
        </header>

        {showAdminPanel ? (
          <AdminPanel onBack={() => setShowAdminPanel(false)} allSites={Object.keys(siteMap)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3 space-y-6">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-4"><CardTitle className="text-xs font-black text-zinc-400 flex items-center gap-2 uppercase tracking-widest"><Plus className="w-4 h-4 text-emerald-500" /> Assemble Widget</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Site</label>
                      <Select value={newWidgetForm.site} onValueChange={v => setNewWidgetForm({ ...newWidgetForm, site: v, device: "All Devices" })}>
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9 text-xs font-bold text-zinc-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {Object.keys(siteMap).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Device</label>
                      <Select value={newWidgetForm.device} onValueChange={v => setNewWidgetForm({ ...newWidgetForm, device: v })}>
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9 text-xs font-bold text-zinc-200">
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
                          <SelectItem value="clients">Total Clients</SelectItem>
                          <SelectItem value="health">Health Distribution</SelectItem>
                          <SelectItem value="state">Device State</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={addWidget} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 mt-2">ADD TO DASHBOARD</Button>
                  </div>
                </CardContent>
              </Card>

              {isAdmin && (
                <Card className="bg-zinc-900 border-green-900/40">
                  <CardHeader><CardTitle className="text-xs font-black text-green-500 uppercase tracking-widest">Admin Sync</CardTitle></CardHeader>
                  <CardContent><Button onClick={() => handleLoad()} disabled={loading} className="w-full bg-zinc-800 hover:bg-zinc-700 text-green-500 font-bold border border-green-900/50">FORCE CLOUD REFRESH</Button></CardContent>
                </Card>
              )}
              {status && <div className="text-[9px] text-zinc-500 font-mono italic text-center animate-pulse tracking-wide uppercase">{status}</div>}
            </div>

            <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6">
              {widgets.map(w => (
                <div key={w.id} className="lg:col-span-6 xl:col-span-4">
                  <WidgetCard
                    widget={w}
                    timeRange={timeRange}
                    onRemove={() => removeWidget(w.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({ widget, onRemove, timeRange }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/analyze`, {
        site: widget.site,
        device: widget.device,
        metric: widget.metric,
        hours: timeRange === "0" ? null : parseInt(timeRange)
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      setData(res.data);
    } catch (err) { }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [widget, timeRange]);

  return (
    <Card className="bg-zinc-900 border-zinc-800 shadow-xl relative group">
      <button onClick={onRemove} className="absolute top-4 right-4 text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          {widget.metric === 'clients' ? <TrendingUp className="w-3 h-3 text-blue-500" /> : <PieChart className="w-3 h-3 text-emerald-500" />}
          {widget.site} {widget.device !== 'All Devices' ? `- ${widget.device}` : ''} - {widget.metric.toUpperCase()}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[250px] flex items-center justify-center p-4">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-zinc-800" /> : (
          <ResponsiveContainer width="100%" height="100%">
            {widget.type === 'area' ? (
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <defs><linearGradient id="colorG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickFormatter={(val) => {
                    const [date, time] = val.split(' ');
                    if (!date || !time) return val;
                    const [y, m, d] = date.split('-');
                    return `${d}/${m} ${time}`;
                  }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#71717a' }}
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
                <Legend wrapperStyle={{ fontSize: '10px' }} />
              </ReChartsPieChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default App;
