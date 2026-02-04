import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { MainNav } from './main-nav';
import { Button } from './ui/button';
import { Construction } from 'lucide-react';
import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
            <Link href="/" className="flex items-center gap-2">
                 <Button variant="ghost" size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg">
                    <Construction className="h-5 w-5" />
                 </Button>
                <h1 className="text-xl font-bold text-primary">Maintenance Hub</h1>
            </Link>
        </SidebarHeader>
        <SidebarContent className="p-4">
          <MainNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="max-w-full overflow-x-hidden p-4 lg:p-8">
        <div className='flex justify-end mb-4 -mt-2'>
           <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
