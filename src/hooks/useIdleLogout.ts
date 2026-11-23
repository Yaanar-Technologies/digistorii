"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function useIdleLogout(company: string, type: string, skipIdleTimeout: boolean = false) {
    const router = useRouter();
 
    useEffect(() => {
        if (!company || company === "default-tenant" || skipIdleTimeout) return; // skip
        let timeout: NodeJS.Timeout;
 
        const logout = async () => {
            await fetch(`/api/auth/logout?type=${type}`, { method: "POST" });
 
            const path = type === "admin" ? "admin/login" : "workspace/login";
            router.replace(`/${company}/${path}`);
        };
 
        const resetTimer = () => {
            clearTimeout(timeout);
 
            timeout = setTimeout(() => {
                logout();
            }, 30 * 60 * 1000); // 30 minutes
        };
 
        const events = [
            "mousemove",
            "keydown",
            "mousedown",
            "touchstart",
            "scroll",
        ];
 
        events.forEach((event) =>
            window.addEventListener(event, resetTimer)
        );
 
        resetTimer();
 
        return () => {
            clearTimeout(timeout);
            events.forEach((event) =>
                window.removeEventListener(event, resetTimer)
            );
        };
    }, [company, router, type, skipIdleTimeout]);
}