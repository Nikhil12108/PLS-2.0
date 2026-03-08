const PptxGenJS = require("pptxgenjs");
const fs = require('fs');

async function testNodeBuffer() {
    console.log("Starting test...");
    const pres = new PptxGenJS();

    const parsedData = {
        primary_endpoint: {
            chart_data: [
                {
                    chart_title: "My Chart",
                    chart_type: "bar_chart",
                    data: {
                        labels: ["Group A", "Group B"],
                        datasets: [
                            { label: "Data", data: ["12.5%", "14.2%"] }
                        ]
                    }
                }
            ]
        }
    };

    const endpointData = parsedData.primary_endpoint.chart_data;
    console.log("endpointData:", JSON.stringify(endpointData, null, 2));

    for (const chartInfo of endpointData) {
        const slide = pres.addSlide();
        slide.addText(chartInfo.chart_title || "Chart", {
            x: 0.5, y: 0.5, fontSize: 18, bold: true
        });

        const dataConfig = chartInfo.data || {};
        const labels = dataConfig.labels || [];
        const datasets = dataConfig.datasets || [];

        let pptxChartType = pres.ChartType.bar;
        if (chartInfo.chart_type === 'line_chart') pptxChartType = pres.ChartType.line;
        if (chartInfo.chart_type === 'pie_chart') pptxChartType = pres.ChartType.pie;

        let chartDataObj = datasets.map((ds) => ({
            name: ds.label || "Series",
            labels: labels,
            values: (ds.data || []).map((val) => {
                const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                return isNaN(num) ? 0 : num;
            })
        }));

        if (pptxChartType === pres.ChartType.pie) {
            chartDataObj = [chartDataObj[0]];
        }

        console.log("Calling addChart with type:", pptxChartType, "Data:", JSON.stringify(chartDataObj));
        try {
            slide.addChart(pptxChartType, chartDataObj, {
                x: 1, y: 1.5, w: 8, h: 4,
                showTitle: false,
                showLegend: true,
                showPercent: pptxChartType === pres.ChartType.pie,
                dataLabelFormatCode: pptxChartType === pres.ChartType.pie ? '0%' : 'General'
            });
            console.log("Chart added successfully to slide object.");
        } catch (e) {
            console.error("Failed to add chart:", e);
        }
    }

    try {
        console.log("Writing presentation buffer...");
        const buffer = await pres.write({ outputType: "arraybuffer" });
        console.log("Buffer acquired, length:", buffer.byteLength);
        fs.writeFileSync("test_nodebuffer.pptx", Buffer.from(buffer));
        console.log("Saved test_nodebuffer.pptx");
    } catch (e) {
        console.error("Write failed:", e);
    }
}

testNodeBuffer();
