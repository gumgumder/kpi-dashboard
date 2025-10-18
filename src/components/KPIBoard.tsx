'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ShortVideosTab from '@/components/ShortVideosTab';
import OutreachTab from '@/components/OutreachTab';
import RevenueTab from '@/components/RevenueTab';
import PlanTab from "@/components/PlanTab";

export default function KPIBoard() {
    return (
        <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-slate-100 p-6">
            <Tabs defaultValue="outreach" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="outreach">Outreach</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="videos">Short Videos</TabsTrigger>
                    <TabsTrigger value="plan">Plan</TabsTrigger>
                </TabsList>

                <TabsContent value="outreach" className="data-[state=inactive]:hidden">
                    <OutreachTab />
                </TabsContent>

                <TabsContent value="revenue" className="data-[state=inactive]:hidden">
                    <RevenueTab />
                </TabsContent>

                <TabsContent value="videos" className="data-[state=inactive]:hidden">
                    <ShortVideosTab />
                </TabsContent>

                <TabsContent value="plan" className="data-[state=inactive]:hidden">
                    <PlanTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
