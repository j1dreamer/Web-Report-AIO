import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Loader2, UserPlus, Users, Trash2, Shield, Globe, X } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000/api";

function AdminPanel({ onBack, allSites }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState({
        username: "",
        password: "",
        role: "user",
        allowed_sites: []
    });
    const [status, setStatus] = useState("");

    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/admin/users`, { headers });
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.password) return;

        try {
            await axios.post(`${API_BASE}/admin/users`, newUser, { headers });
            setStatus("Tạo tài khoản thành công!");
            setNewUser({ username: "", password: "", role: "user", allowed_sites: [] });
            fetchUsers();
        } catch (err) {
            setStatus("Lỗi: " + (err.response?.data?.detail || "Không rõ"));
        }
    };

    const handleDeleteUser = async (username) => {
        if (!window.confirm(`Xóa tài khoản ${username}?`)) return;
        try {
            await axios.delete(`${API_BASE}/admin/users/${username}`, { headers });
            fetchUsers();
        } catch (err) {
            alert(err.response?.data?.detail);
        }
    };

    const toggleSite = (site) => {
        setNewUser(prev => {
            const sites = [...prev.allowed_sites];
            const index = sites.indexOf(site);
            if (index > -1) sites.splice(index, 1);
            else sites.push(site);
            return { ...prev, allowed_sites: sites };
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tighter text-white">ADMIN DASHBOARD</h2>
                    <p className="text-zinc-500 font-medium">Quản lý người dùng & Phân quyền hạ tầng</p>
                </div>
                <Button onClick={onBack} variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white transition-all">
                    <X className="w-4 h-4 mr-2" /> QUAY LẠI
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Create User Form */}
                <Card className="lg:col-span-5 bg-zinc-900 border-zinc-800 shadow-xl overflow-hidden ring-1 ring-zinc-800">
                    <CardHeader className="bg-zinc-800/20 border-b border-zinc-800 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-400">
                            <UserPlus className="w-4 h-4" /> TẠO TÀI KHOẢN MỚI
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-black text-zinc-500">Username</label>
                                    <Input
                                        value={newUser.username}
                                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                        className="bg-zinc-950 border-zinc-800"
                                        placeholder="tên đăng nhập"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-black text-zinc-500">Password</label>
                                    <Input
                                        type="password"
                                        value={newUser.password}
                                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                        className="bg-zinc-950 border-zinc-800"
                                        placeholder="mật khẩu"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-zinc-500">Quyền hạn</label>
                                <div className="flex gap-2">
                                    {["user", "admin"].map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setNewUser({ ...newUser, role: r })}
                                            className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold border-2 transition-all ${newUser.role === r ? 'border-blue-600 bg-blue-600/10 text-blue-500' : 'border-zinc-800 text-zinc-500 grayscale'
                                                }`}
                                        >
                                            {r.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {newUser.role === "user" && (
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-black text-zinc-500 flex justify-between">
                                        Sites được phép truy cập
                                        <span className="text-blue-500">{newUser.allowed_sites.length} đã chọn</span>
                                    </label>
                                    <div className="max-h-48 overflow-y-auto p-2 bg-zinc-950 rounded-lg border border-zinc-800 space-y-1 custom-scrollbar">
                                        {allSites.filter(s => s !== "All Sites").map(site => (
                                            <div
                                                key={site}
                                                onClick={() => toggleSite(site)}
                                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-all ${newUser.allowed_sites.includes(site) ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-zinc-900 text-zinc-600'
                                                    }`}
                                            >
                                                <span className="text-xs font-medium">{site}</span>
                                                {newUser.allowed_sites.includes(site) && <Globe className="w-3 h-3" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-11">
                                LƯU TÀI KHOẢN
                            </Button>
                            {status && <p className="text-[10px] text-center text-emerald-500 font-bold uppercase tracking-widest animate-pulse">{status}</p>}
                        </form>
                    </CardContent>
                </Card>

                {/* User List */}
                <Card className="lg:col-span-7 bg-zinc-900 border-zinc-800 shadow-xl overflow-hidden ring-1 ring-zinc-800">
                    <CardHeader className="bg-zinc-800/20 border-b border-zinc-800 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-300">
                            <Users className="w-4 h-4 text-emerald-500" /> DANH SÁCH TÀI KHOẢN
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-zinc-800">
                            {loading ? (
                                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-700" /></div>
                            ) : users.map(u => (
                                <div key={u.username} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-full ${u.role === 'admin' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                            {u.role === 'admin' ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white uppercase tracking-tight">{u.username}</h4>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase">{u.role}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[10px] text-zinc-500 uppercase font-black mb-1">Allowed Sites</p>
                                            <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                                                {u.role === 'admin' ? (
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700">ALL INFRASTRUCTURE</span>
                                                ) : u.allowed_sites?.length > 0 ? (
                                                    u.allowed_sites.map(s => <span key={s} className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{s}</span>)
                                                ) : <span className="text-[9px] text-zinc-600 italic">None Assigned</span>}
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => handleDeleteUser(u.username)}
                                            variant="ghost"
                                            className="text-zinc-700 hover:text-red-500 hover:bg-red-500/10 h-8 w-8 p-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default AdminPanel;
