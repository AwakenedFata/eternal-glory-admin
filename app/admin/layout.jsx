"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const navigation = [
  { name: "Dashboard", href: "/admin" },
  { name: "Serial Numbers", href: "/admin/serials" },
  { name: "Certificates", href: "/admin/certificates" },
  { name: "Verification Logs", href: "/admin/verification-logs" },
  { name: "Stores", href: "/admin/stores" },
  { name: "Social Media", href: "/admin/socials" },
  { name: "Webhooks", href: "/admin/webhooks" },
  { name: "Audit Logs", href: "/admin/audit-logs" },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center justify-center border-b border-gray-200 px-6">
          <img src="/assets/blacklogo.png" alt="Eternal Glory" className="h-10 object-contain" />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
          <nav className="flex-1 space-y-1 px-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700 truncate max-w-[180px]">
                {session?.user?.email}
              </p>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-xs font-medium text-red-600 hover:text-red-500 mt-1"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
