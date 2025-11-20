'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Terminal, FolderOpen, Target, LogOut, FolderTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Agents', href: '/agents', icon: Users },
  { name: 'Terminal', href: '/terminal', icon: Terminal },
  { name: 'File Manager', href: '/filemanager', icon: FolderTree },
  { name: 'Files', href: '/files', icon: FolderOpen },
  { name: 'Payloads', href: '/payloads', icon: Target },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="flex flex-col w-64 bg-gray-900 text-white">
      <div className="flex items-center justify-center h-16 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-red-500">pypyc2</h1>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-800 space-y-3">
        {user && (
          <div className="mb-3">
            <p className="text-xs text-gray-500">Logged in as</p>
            <p className="text-sm text-gray-300 font-medium">{user.username}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full text-gray-400 hover:bg-red-900/20 hover:text-red-400"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
        <p className="text-xs text-gray-500">v1.0.0 | C2 Framework</p>
      </div>
    </div>
  );
}
