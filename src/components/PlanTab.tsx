export default function PlanTab() {
    return (<div className="p-6 text-lg text-slate-700 flex flex-col items-center space-y-8"> {/* Two-column section */}
        <div className="grid grid-cols-2 gap-12 w-full max-w-5xl text-center">
            <section><h2 className="text-xl font-bold mb-2">Commitments Jakob</h2>
                <ul className="list-disc list-inside space-y-1 text-left inline-block">
                    <li>J: Ro100 – 5x pro Woche (200 Nachrichten, 10 Kommentare/Tag, Rest Calls)</li>
                </ul>
            </section>
            <section><h2 className="text-xl font-bold mb-2">Commitments Annika</h2>
                <ul className="list-disc list-inside space-y-1 text-left inline-block">
                    <li>A: 7x Posts pro Woche</li>
                    <li>A: 200 Seiten pro Woche lesen</li>
                    <li>A: Glaubenssätze wiederholen</li>
                </ul>
            </section>
        </div>
        {/* General section below */}
        <section className="w-full max-w-3xl text-center"><h2 className="text-xl font-bold mb-2">General
            Commitments</h2>
            <ul className="list-disc list-inside space-y-1 text-left inline-block">
                <li>Complain dashboard / Emotional state dashboard</li>
                <li>Daily danceparty (1 song)</li>
                <li>Daily “I am the voice”</li>
                <li>Codeword: STATE – watch your state</li>
                <li>2 date schedule (am 1. des Monats)</li>
                <li>1 day Mind Movie</li>
                <li>1 day Rebranding</li>
                <li>1 day Offer</li>
                <li>Peer group (End of month)</li>
                <li>Frustration = Innovation = 3 ideas</li>
                <li>Questions: What extraordinary at?</li>
                <li>Questions: Where do we wanna go?</li>
            </ul>
        </section>
    </div>);
}