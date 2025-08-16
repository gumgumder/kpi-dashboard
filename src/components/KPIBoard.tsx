'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KPITab from '@/components/KPITab';
import ShortVideosTab from '@/components/ShortVideosTab';

export default function KPIBoard() {
    return (
        <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-slate-100 p-6">
            <Tabs defaultValue="kpis" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="kpis">KPIs</TabsTrigger>
                    <TabsTrigger value="videos">Short Videos</TabsTrigger>
                </TabsList>

                <TabsContent value="kpis" className="data-[state=inactive]:hidden">
                    <KPITab />
                </TabsContent>

                <TabsContent value="videos" className="data-[state=inactive]:hidden">
                    <ShortVideosTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
