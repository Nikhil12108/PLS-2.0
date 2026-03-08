const PptxGenJS = require("pptxgenjs");

async function testChart() {
    let pres = new PptxGenJS();
    let slide = pres.addSlide();

    // Replicating our exact route.ts payload configuration
    let chartDataObj = [
        {
            name: "Series 1",
            labels: ["A", "B", "C"],
            values: [10.5, 20.2, 30]
        }
    ];

    try {
        slide.addChart(pres.ChartType.bar, chartDataObj, {
            x: 1, y: 1.5, w: 8, h: 4,
            showTitle: false,
            showLegend: true,
            showPercent: false,
            dataLabelFormatCode: 'General'
        });

        slide = pres.addSlide();
        let pieDataObj = [
            {
                name: "PieSeries",
                labels: ["Mild", "Severe"],
                values: [40, 60]
            }
        ];
        slide.addChart(pres.ChartType.pie, pieDataObj, {
            x: 1, y: 1.5, w: 8, h: 4,
            showTitle: false,
            showLegend: true,
            showPercent: true,
            dataLabelFormatCode: '0%'
        });

        const buffer = await pres.write({ outputType: "nodebuffer" });
        require("fs").writeFileSync("test_chart.pptx", buffer);
        console.log("Chart PPTX created successfully at test_chart.pptx!");
    } catch (e) {
        console.error("Failed to generate:", e);
    }
}

testChart();
