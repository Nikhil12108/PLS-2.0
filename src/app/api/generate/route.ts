import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import { patchDocument, PatchType, TextRun, Table, TableRow, TableCell, Paragraph, BorderStyle, WidthType, AlignmentType, VerticalAlign } from 'docx';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        const { parsedData, mappingName } = await request.json();

        if (!parsedData) {
            return NextResponse.json({ error: 'Missing parsedData for generation' }, { status: 400 });
        }

        const zip = new JSZip();

        // 1. Generate PPTX Slide (if chart data exists)
        let pptxBuffer: Uint8Array | null = null;

        const getChartData = (placeholderInfo: unknown) => {
            if (!placeholderInfo) return null;

            // Auto-unwrap if it's deeply wrapped
            let val: any = placeholderInfo;
            if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 1) {
                val = (val as Record<string, any>)[Object.keys(val)[0]];
            }

            if (Array.isArray(val)) {
                // Ensure the array contains actual chart objects, not just strings (like primary_endpoint questions)
                if (val.length > 0 && typeof val[0] === 'object' && ('data' in val[0] || 'chart_data' in val[0] || 'labels' in val[0])) {
                    return val;
                }
                return null;
            }
            if (val && typeof val === 'object') {
                const rec = val as Record<string, unknown>;
                if (rec.chart_data && Array.isArray(rec.chart_data)) return rec.chart_data;
                if (rec["Key secondary endpoint results"] && Array.isArray(rec["Key secondary endpoint results"])) return rec["Key secondary endpoint results"];
            }
            return null;
        };

        // efficacy_primary_endpoint_results_conclusion is where the chart data is actually stored in mapping
        const endpointData = getChartData(parsedData.efficacy_primary_endpoint_results_conclusion)
            || getChartData(parsedData.primary_endpoint);

        console.log("PPTX GENERATION: endpointData found?", !!endpointData, "Type:", typeof endpointData, "IsArray:", Array.isArray(endpointData));
        if (endpointData) {
            const pres = new PptxGenJS();
            console.log("PPTX GENERATION: Processing", endpointData.length, "chart items.");

            for (const chartInfo of endpointData) {
                const slide = pres.addSlide();
                slide.addText(chartInfo.chart_title || "Chart", {
                    x: 0.5, y: 0.5, fontSize: 18, bold: true
                });

                const dataConfig = chartInfo.data || {};
                const labels = dataConfig.labels || [];
                const datasets = dataConfig.datasets || [];

                if (labels.length > 0 && datasets.length > 0) {
                    let pptxChartType = pres.ChartType.bar;
                    if (chartInfo.chart_type === 'line_chart') pptxChartType = pres.ChartType.line;
                    if (chartInfo.chart_type === 'pie_chart') pptxChartType = pres.ChartType.pie;

                    // PptxGenJS requires strictly numerical values for rendering chart data plots
                    let chartDataObj = datasets.map((ds: { label?: string, data?: unknown[] }) => ({
                        name: ds.label || "Series",
                        labels: labels,
                        values: (ds.data || []).map((val: unknown) => {
                            const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                            return isNaN(num) ? 0 : num;
                        })
                    }));

                    // Pie charts generally only accept a single dataset/series in PptxGenJS
                    if (pptxChartType === pres.ChartType.pie) {
                        chartDataObj = [chartDataObj[0]];
                    }

                    console.log("PPTX GENERATION: Adding chart type:", pptxChartType, "with data:", JSON.stringify(chartDataObj));

                    try {
                        slide.addChart(pptxChartType, chartDataObj, {
                            x: 1, y: 1.5, w: 8, h: 4,
                            showTitle: false,
                            showLegend: true,
                            showPercent: pptxChartType === pres.ChartType.pie, // Show % for pie charts just like utility.py
                            dataLabelFormatCode: pptxChartType === pres.ChartType.pie ? '0%' : 'General'
                        });
                    } catch (err) {
                        console.error("Failed to add chart to PPTX:", err);
                    }
                }
            }

            const buffer = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
            pptxBuffer = new Uint8Array(buffer);
            zip.file("Charts.pptx", pptxBuffer);
        }

        // Generate Dynamic Filenames
        const getTrialNumber = (data: unknown) => {
            if (!data || typeof data !== 'object') return "Unknown_Trial";
            const tn = (data as Record<string, unknown>).trial_number;
            if (!tn) return "Unknown_Trial";
            if (typeof tn === 'string') return tn.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
            if (typeof tn === 'object' && Object.keys(tn).length === 1) {
                const val = (tn as Record<string, unknown>)[Object.keys(tn as Record<string, unknown>)[0]];
                if (typeof val === 'string') return val.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
            }
            return "Unknown_Trial";
        };
        const trialNumber = getTrialNumber(parsedData);
        const mapProfileName = mappingName === 'results_PLS' ? 'Results' : 'Protocol';
        const docxFilename = `${mapProfileName} PLS - ${trialNumber}.docx`;
        const zipFilename = `${mapProfileName} PLS - ${trialNumber}.zip`;

        // 2. Map and Patch Original Word Documents
        const templateFilename = mappingName === 'protocol_PLS' ? 'template2.docx' : 'template.docx';
        const templatePath = path.join(process.cwd(), 'src', 'templates', templateFilename);

        let templateBuffer: Buffer;
        try {
            templateBuffer = await fs.promises.readFile(templatePath);
        } catch (e: unknown) {
            console.error("Template read error", e);
            throw new Error(`Template file ${templateFilename} not found at ${templatePath}`);
        }

        const textPatches: Record<string, any> = {};
        const tablePatches: Record<string, any> = {};

        for (const [key, rawValue] of Object.entries(parsedData)) {
            // Auto unwrap if the object logically groups the data but AI added metadata
            let value = rawValue;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Strip metadata properties to maintain clean document parsing
                const keysToRemove = ['source', '_citations', 'citations', 'reasoning'];
                for (const k of keysToRemove) {
                    if (k in value) {
                        delete (value as Record<string, unknown>)[k];
                    }
                }

                // If it's wrapped in a redundant single key (e.g. prompt_name: { ... }), unwrap it
                if (Object.keys(value).length === 1) {
                    value = (value as Record<string, unknown>)[Object.keys(value)[0]];
                }
            }

            if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).headers) && Array.isArray((value as Record<string, unknown>).rows)) {
                // It's a table based on headers and rows properties in the json object
                const { headers, rows } = value as { headers: string[], rows: string[][] };

                const headerColors = ['EC6602', '0460A9', '2E74B5', '0091DF', '326496', '3C7896'];

                const tableRows = [
                    new TableRow({
                        children: headers.map((h: string, i: number) => {
                            const bgColor = i < headerColors.length ? headerColors[i] : '0460A9';
                            return new TableCell({
                                shading: { fill: bgColor },
                                verticalAlign: VerticalAlign.CENTER,
                                children: [new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [new TextRun({ text: String(h), bold: true, color: "FFFFFF" })]
                                })],
                            });
                        }),
                    }),
                    ...rows.map((r: string[]) => new TableRow({
                        children: r.map((c: string) => new TableCell({
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun(String(c))]
                            })],
                        })),
                    }))
                ];

                tablePatches[key] = {
                    type: PatchType.DOCUMENT,
                    children: [new Table({
                        rows: tableRows,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                        alignment: AlignmentType.RIGHT,
                        margins: {
                            left: 100,
                            right: 100,
                        },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                            bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                            left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                            right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                        }
                    })]
                };
            } else if (value !== null && value !== undefined) {
                // If it's an array, it might be an array of strings (like inclusion_criteria or primary_endpoint)
                // or an array of Q&A objects (like key_secondary_endpoint_results)
                if (key === 'treatment' || (typeof value === 'object' && (value as Record<string, unknown>).treatment_summary && (value as Record<string, unknown>).groups)) {
                    // It's a treatment payload
                    const paragraphs: Paragraph[] = [];
                    const summary = (value as Record<string, unknown>).treatment_summary as string || '';
                    const groups = (value as Record<string, unknown>).groups as Array<{ name: string, participants: string | number }> || [];
                    const total = (value as Record<string, unknown>).total_participants as number || 0;

                    paragraphs.push(new Paragraph({ children: [new TextRun(summary)] }));
                    // Add spacing
                    paragraphs.push(new Paragraph({ children: [] }));

                    if (groups.length <= 4) {
                        if (groups.length > 0) {
                            const runs = [new TextRun(`${total} participants received one of these treatments:`)];
                            for (const g of groups) {
                                runs.push(new TextRun({ text: `• ${g.name} – ${g.participants} participants`, break: 1 }));
                            }
                            textPatches[key] = { type: PatchType.PARAGRAPH, children: runs };
                        } else {
                            textPatches[key] = { type: PatchType.PARAGRAPH, children: [new TextRun("")] };
                        }
                    } else {
                        // Creates a 3 row layout: header, dose, participants
                        const colorPalette = ['10384F', '00617F', '2E74B5', '0091DF', '326496', '3C7896'];
                        const _reSpace = /(\d+\s*(?:mg|µg|mcg|g|ml|mL|IU|units?)(?:\/\w+)?)/i;

                        const tableRows = [
                            new TableRow({
                                children: groups.map((g: { name: string, participants: string | number }, i: number) => new TableCell({
                                    shading: { fill: colorPalette[i % colorPalette.length] },
                                    verticalAlign: VerticalAlign.CENTER,
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: String(g.name), bold: true, color: "FFFFFF" })]
                                    })],
                                }))
                            }),
                            new TableRow({
                                children: groups.map((g: any) => {
                                    const doseMatch = _reSpace.exec(g.name);
                                    const doseText = doseMatch ? doseMatch[1] : g.name;
                                    return new TableCell({
                                        verticalAlign: VerticalAlign.CENTER,
                                        children: [new Paragraph({
                                            alignment: AlignmentType.CENTER,
                                            children: [new TextRun(String(doseText))]
                                        })],
                                    });
                                })
                            }),
                            new TableRow({
                                children: groups.map((g: any) => new TableCell({
                                    verticalAlign: VerticalAlign.CENTER,
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: String(g.participants), bold: true })]
                                    })],
                                }))
                            })
                        ];

                        textPatches[key] = {
                            type: PatchType.DOCUMENT,
                            children: [
                                ...paragraphs,
                                new Table({
                                    rows: tableRows,
                                    width: { size: 100, type: WidthType.PERCENTAGE },
                                    borders: {
                                        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                        left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                        right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    }
                                })
                            ]
                        };
                    }
                } else if (key === 'efficacy_primary_endpoint_results_conclusion' || (value && Array.isArray((value as any).chart_data))) {
                    let chart_data_items = Array.isArray(value) ? value : (value as any).chart_data;
                    if (!chart_data_items) chart_data_items = [];

                    const rootBlocks: any[] = [];

                    for (const item of chart_data_items) {
                        const question = item.question || '';
                        const conclusion = item.primary_endpoint_results_conclusion || '';
                        const definition = item.clinical_term_definition || '';
                        const assessment = item.primary_endpoint_results_assessment || '';
                        const resultsStr = item.Primary_endpoint_results || '';

                        if (question) rootBlocks.push(new Paragraph({ children: [new TextRun({ text: question, bold: true })] }));
                        if (conclusion) rootBlocks.push(new Paragraph({ children: [new TextRun({ text: conclusion, italics: true })] }));
                        if (definition) rootBlocks.push(new Paragraph({ children: [new TextRun(definition)] }));
                        if (assessment) rootBlocks.push(new Paragraph({ children: [new TextRun(assessment)] }));

                        const dataConfig = item.data || {};
                        const labels = dataConfig.labels || [];
                        const datasets = dataConfig.datasets || [];

                        if (labels.length > 0 && datasets.length > 0) {
                            const colorPalette = ['10384F', '00617F', '2E74B5', '0091DF', '326496', '3C7896'];
                            const tblRows = [
                                new TableRow({
                                    children: labels.map((lb: any, i: number) => new TableCell({
                                        shading: { fill: colorPalette[i % colorPalette.length] },
                                        verticalAlign: VerticalAlign.CENTER,
                                        children: [new Paragraph({
                                            alignment: AlignmentType.CENTER,
                                            children: [new TextRun({ text: String(lb), bold: true, color: "FFFFFF" })]
                                        })],
                                    }))
                                }),
                                ...datasets.map((ds: any) => new TableRow({
                                    children: labels.map((_: any, ci: number) => {
                                        const ds_vals = ds.data || [];
                                        const val = ci < ds_vals.length ? ds_vals[ci] : '';
                                        return new TableCell({
                                            verticalAlign: VerticalAlign.CENTER,
                                            children: [new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                children: [new TextRun({ text: String(val), bold: true })]
                                            })],
                                        });
                                    })
                                }))
                            ];

                            rootBlocks.push(new Table({
                                rows: tblRows,
                                width: { size: 100, type: WidthType.PERCENTAGE },
                                borders: {
                                    top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                                }
                            }));
                        } else if (resultsStr) {
                            rootBlocks.push(new Paragraph({ children: [new TextRun(resultsStr)] }));
                        }

                        // Add spacing between endpoints
                        rootBlocks.push(new Paragraph({ children: [] }));
                    }

                    if (rootBlocks.length > 0) {
                        textPatches[key] = { type: PatchType.DOCUMENT, children: rootBlocks };
                    } else {
                        textPatches[key] = { type: PatchType.PARAGRAPH, children: [new TextRun(JSON.stringify(value))] };
                    }
                } else if (Array.isArray(value)) {
                    const runs: TextRun[] = [];
                    for (let i = 0; i < value.length; i++) {
                        const item = value[i];
                        if (typeof item === 'string') {
                            runs.push(new TextRun({ text: `• ${item}`, break: i > 0 ? 1 : 0 }));
                        } else if (typeof item === 'object' && item !== null) {
                            if (item.question && item.answer) {
                                runs.push(new TextRun({ text: String(item.question), bold: true, break: runs.length > 0 ? 2 : 0 }));
                                runs.push(new TextRun({ text: String(item.answer), break: 1 }));
                            } else if (item.question && item.primary_endpoint_results_conclusion) {
                                runs.push(new TextRun({ text: String(item.question), bold: true, break: runs.length > 0 ? 2 : 0 }));
                                runs.push(new TextRun({ text: String(item.primary_endpoint_results_conclusion), break: 1 }));
                            }
                        }
                    }
                    if (runs.length > 0) {
                        textPatches[key] = {
                            type: PatchType.PARAGRAPH,
                            children: runs
                        };
                    } else {
                        // Fallback
                        textPatches[key] = {
                            type: PatchType.PARAGRAPH,
                            children: [new TextRun(JSON.stringify(value))]
                        };
                    }
                } else if (typeof value === 'object') {
                    // Fallback for an object
                    textPatches[key] = {
                        type: PatchType.PARAGRAPH,
                        children: [new TextRun(JSON.stringify(value, null, 2))]
                    };
                } else {
                    // Fallback to text patch for standard strings/numbers.
                    textPatches[key] = {
                        type: PatchType.PARAGRAPH,
                        children: [new TextRun(String(value))]
                    };
                }
            }
        }

        let docxBuffer = await patchDocument({
            outputType: "nodebuffer",
            data: templateBuffer,
            patches: textPatches,
            placeholderDelimiters: { start: "{", end: "}" } // Matches {placeholder_name}
        });

        if (Object.keys(tablePatches).length > 0) {
            docxBuffer = await patchDocument({
                outputType: "nodebuffer",
                data: docxBuffer,
                patches: tablePatches,
                placeholderDelimiters: { start: "{{", end: "}}" } // Matches {{placeholder_name}}
            });
        }

        zip.file(docxFilename, docxBuffer);

        // 3. Zip and Return
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        return new Response(zipBlob, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${zipFilename}"`,
            },
        });

    } catch (error: any) {
        console.error("Generation error:", error);
        return NextResponse.json({ error: "Generation failed", details: error.message }, { status: 500 });
    }
}
