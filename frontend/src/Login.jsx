import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Loader2, Lock, User, ShieldCheck } from "lucide-react";

const API_BASE = (function () {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return "http://localhost:8000/api";
    }
    return `http://${host}:3001/api`;
})();

function Login({ onLoginSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
            const { access_token, user } = res.data;

            // Save to local storage
            localStorage.setItem("token", access_token);
            localStorage.setItem("user", JSON.stringify(user));

            onLoginSuccess(user);
        } catch (err) {
            setError(err.response?.data?.detail || "Đăng nhập thất bại");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-black to-black">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-black tracking-tighter text-white flex items-center justify-center gap-3">
                        <span className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">HPE</span>
                        INSIGHTS
                    </h1>
                    <p className="text-zinc-400 font-medium tracking-wide">Network Administration Portal</p>
                </div>

                <Card className="bg-zinc-900 border-zinc-800 shadow-2xl shadow-blue-500/5 ring-1 ring-zinc-800">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                            <ShieldCheck className="w-5 h-5 text-blue-500" />
                            Đăng nhập hệ thống
                        </CardTitle>
                        <CardDescription className="text-zinc-400">Nhập tài khoản để truy cập báo cáo traffic</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-zinc-400 tracking-widest">Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                                    <Input
                                        type="text"
                                        placeholder="admin"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="bg-zinc-950 border-zinc-800 pl-10 h-11 focus:ring-blue-500 text-white"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-zinc-400 tracking-widest">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="bg-zinc-950 border-zinc-800 pl-10 h-11 focus:ring-blue-500 text-white"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold text-red-500 animate-shake">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-11 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "VÀO HỆ THỐNG"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-center text-zinc-600 text-[10px] uppercase font-bold tracking-widest">
                    Hệ thống phân tích báo cáo HPE &copy; 2026
                </p>
            </div>
        </div>
    );
}

export default Login;
