'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KPITab from '@/components/KPITab';
import ShortVideosTab from '@/components/ShortVideosTab';
import OutreachTab from '@/components/OutreachTab';
import RevenueTab from '@/components/RevenueTab';
import DailyInputsTab from '@/components/DailyInputsTab';
import PlanTab from "@/components/PlanTab";

export default function KPIBoard() {
    return (
        <div className="min-h-screen bg-gradient-to-tr from-slate-50 to-slate-100 p-6">
            <Tabs defaultValue="kpis" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="kpis">KPIs</TabsTrigger>
                    <TabsTrigger value="videos">Short Videos</TabsTrigger>
                    <TabsTrigger value="plan">Plan</TabsTrigger>
                    <TabsTrigger value="outreach">Outreach</TabsTrigger>
                    <TabsTrigger value="revenue">Revenue</TabsTrigger>
                    <TabsTrigger value="daily">Daily Inputs</TabsTrigger>
                </TabsList>

                <TabsContent value="kpis" className="data-[state=inactive]:hidden">
                    <KPITab />
                </TabsContent>

                <TabsContent value="videos" className="data-[state=inactive]:hidden">
                    <ShortVideosTab />
                </TabsContent>

                <TabsContent value="plan" className="data-[state=inactive]:hidden">
                    <PlanTab />
                </TabsContent>

                <TabsContent value="outreach" className="data-[state=inactive]:hidden">
                    <OutreachTab />
                </TabsContent>

                <TabsContent value="revenue" className="data-[state=inactive]:hidden">
                    <RevenueTab />
                </TabsContent>

                <TabsContent value="daily" className="data-[state=inactive]:hidden">
                    <DailyInputsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
