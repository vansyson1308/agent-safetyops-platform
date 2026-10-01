import { Link, Outlet, useLocation } from "react-router-dom"
import { Shield, LayoutDashboard, Bot, FileText, Activity, CheckCircle, AlertTriangle, Settings, Globe, ScrollText, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Policies", href: "/policies", icon: FileText },
  { name: "Runs", href: "/runs", icon: Activity },
  { name: "Browser Sandbox", href: "/browser-sessions", icon: Globe },
  { name: "Approvals", href: "/approvals", icon: CheckCircle },
  { name: "Incidents", href: "/incidents", icon: AlertTriangle },
  { name: "Audit Log", href: "/audit-log", icon: ScrollText },
  { name: "Settings", href: "/settings", icon: Settings },
]

export default function AppLayout() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const displayName = user?.name || user?.email || ""
  const initials = displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("")

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Shield className="w-6 h-6 text-emerald-500 mr-2" />
          <span className="text-white font-bold text-lg tracking-tight">SafetyOps</span>
          <span className="ml-2 text-[10px] text-emerald-400 font-mono">v0.1</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-800 text-white"
                    : "hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className={cn("w-5 h-5 mr-3", isActive ? "text-emerald-500" : "text-slate-400")} />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium text-xs">
              {initials}
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="p-2 rounded-md hover:bg-slate-800 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            {navItems.find(item => location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href)))?.name || "Dashboard"}
          </h1>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Environment: Production
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
