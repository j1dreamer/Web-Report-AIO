import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Loader2, UserPlus, Users, Trash2, Shield, Globe, X, Settings } from "lucide-react";

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
    const [isEditing, setIsEditing] = useState(false);
    const [editUsername, setEditUsername] = useState("");

    const fetchUsers = async () => {
        setLoading(true);
        setStatus("");
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE}/admin/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Fetch users failed:", err);
            setStatus("Lỗi tải danh sách: " + (err.response?.data?.detail || err.message));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem("token");
        try {
            if (isEditing) {
                // Prepare update payload
                const payload = {
                    role: newUser.role,
                    allowed_sites: newUser.allowed_sites
                };
                if (newUser.password) payload.password = newUser.password;

                await axios.put(`${API_BASE}/admin/users/${editUsername}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStatus("Cập nhật thành công!");
                cancelEdit();
            } else {
                if (!newUser.username || !newUser.password) {
                    setStatus("Vui lòng nhập đủ tên và mật khẩu");
                    return;
                }
                await axios.post(`${API_BASE}/admin/users`, newUser, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setStatus("Tạo tài khoản thành công!");
                setNewUser({ username: "", password: "", role: "user", allowed_sites: [] });
            }
            fetchUsers();
        } catch (err) {
            setStatus("Lỗi: " + (err.response?.data?.detail || "Không rõ"));
        }
    };

    const startEdit = (user) => {
        setIsEditing(true);
        setEditUsername(user.username);
        setNewUser({
            username: user.username,
            password: "", // Optional during update
            role: user.role,
            allowed_sites: user.allowed_sites || []
        });
        setStatus("");
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditUsername("");
        setNewUser({ username: "", password: "", role: "user", allowed_sites: [] });
        setStatus("");
    };

    const handleDeleteUser = async (username) => {
        if (!window.confirm(`Xóa tài khoản ${username}?`)) return;
        const token = localStorage.getItem("token");
        try {
            await axios.delete(`${API_BASE}/admin/users/${username}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
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
                    <h2 className="text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-3">
                        <Shield className="w-8 h-8 text-blue-500" /> ADMIN PANEL
                    </h2>
                    <p className="text-zinc-500 font-medium">Quản lý người dùng & Phân quyền hạ tầng</p>
                </div>
                <Button onClick={onBack} variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white transition-all rounded-full px-6">
                    <X className="w-4 h-4 mr-2" /> QUAY LẠI
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* User Form (Create/Edit) */}
                <Card className="lg:col-span-5 bg-zinc-900 border-zinc-800 shadow-xl overflow-hidden ring-1 ring-zinc-800">
                    <CardHeader className={`${isEditing ? 'bg-amber-500/10' : 'bg-zinc-800/20'} border-b border-zinc-800 pb-4`}>
                        <CardTitle className={`text-sm font-bold flex items-center gap-2 ${isEditing ? 'text-amber-500' : 'text-blue-400'}`}>
                            {isEditing ? <Settings className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                            {isEditing ? `CHỈNH SỬA: ${editUsername}` : "TẠO TÀI KHOẢN MỚI"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <form onSubmit={handleFormSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-black text-zinc-500">Username</label>
                                    <Input
                                        disabled={isEditing}
                                        value={newUser.username}
                                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                        className="bg-zinc-950 border-zinc-800 text-white disabled:opacity-50"
                                        placeholder="tên đăng nhập"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-black text-zinc-500">
                                        {isEditing ? "Password (để trống nếu ko đổi)" : "Password"}
                                    </label>
                                    <Input
                                        type="password"
                                        value={newUser.password}
                                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                        className="bg-zinc-950 border-zinc-800 text-white"
                                        placeholder={isEditing ? "••••••••" : "mật khẩu"}
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

                            <div className="flex gap-2">
                                <Button type="submit" className={`flex-1 font-bold h-11 shadow-lg ${isEditing ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'}`}>
                                    {isEditing ? "CẬP NHẬT TÀI KHOẢN" : "LƯU TÀI KHOẢN"}
                                </Button>
                                {isEditing && (
                                    <Button type="button" onClick={cancelEdit} variant="outline" className="border-zinc-800">
                                        HỦY
                                    </Button>
                                )}
                            </div>
                            {status && <p className={`text-[10px] text-center font-bold uppercase tracking-widest animate-pulse ${status.includes("Lỗi") ? "text-red-500" : "text-emerald-500"}`}>{status}</p>}
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
                        <div className="divide-y divide-zinc-800 min-h-[300px]">
                            {loading ? (
                                <div className="p-12 flex flex-col items-center gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-zinc-700" />
                                    <span className="text-[10px] text-zinc-600 font-bold uppercase">Đang tải dữ liệu...</span>
                                </div>
                            ) : users.length === 0 ? (
                                <div className="p-12 flex flex-col items-center gap-4 text-center">
                                    <div className="p-4 bg-zinc-800/50 rounded-full">
                                        <Users className="w-10 h-10 text-zinc-700" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-zinc-500 font-bold uppercase text-xs">Không tìm thấy tài khoản</p>
                                        <p className="text-[10px] text-zinc-600">Vui lòng kiểm tra lại kết nối hoặc thêm tài khoản mới.</p>
                                    </div>
                                </div>
                            ) : users.map(u => (
                                <div key={u.username} className={`p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-all ${editUsername === u.username ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-500/20' : ''}`}>
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
                                        <div className="flex items-center gap-2">
                                            <Button
                                                onClick={() => startEdit(u)}
                                                variant="ghost"
                                                className="text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10 h-8 w-8 p-0"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                onClick={() => handleDeleteUser(u.username)}
                                                variant="ghost"
                                                className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 h-8 w-8 p-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
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
