"use client"

import React, { useState, useRef, useEffect } from 'react'
import { extractPrompts } from '@/utils/promptLoader'
import { JsonEditor } from '@/components/JsonEditor'
import { Chatbot } from '@/components/Chatbot'

export default function Dashboard() {
  const [readabilityLevel, setReadabilityLevel] = useState("6th Grade")
  const [mappingName, setMappingName] = useState("results_PLS")

  // Dynamic prompts derived from selection
  const promptData = extractPrompts(readabilityLevel, mappingName)
  const keys = promptData.keys;
  const texts = promptData.texts;
  const mapping = promptData.mapping;

  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Select all prompts by default when mapping changes
    const newSelections: Record<string, boolean> = {}
    keys.forEach(k => newSelections[k] = true)
    setSelectedPrompts(newSelections)
  }, [mappingName]) // omitting keys dependency to avoid infinite loop on object identity change

  const [files, setFiles] = useState<any[]>([])
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null)
  const [extractionFeed, setExtractionFeed] = useState<any[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionTimeMs, setExtractionTimeMs] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let interval: any;
    if (isExtracting) {
      interval = setInterval(() => {
        setExtractionTimeMs(prev => prev + 100);
      }, 100);
    } else if (!isExtracting && extractionTimeMs !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isExtracting]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);

    // Check for duplicates
    const uniqueNewFiles = newFiles.filter(nf =>
      !queuedFiles.some(qf => qf.name === nf.name) &&
      !files.some(f => f.name === nf.name)
    );

    setQueuedFiles(prev => [...prev, ...uniqueNewFiles]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploadToVectorStore = async () => {
    if (queuedFiles.length === 0) return;

    setIsUploading(true);

    const newFileEntries = queuedFiles.map(f => ({
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(2) + " MB",
      status: "Uploading...",
      icon: f.name.endsWith('.pdf') ? "description" : "receipt_long",
      statusIcon: "more_horiz",
      statusColor: "text-slate-400",
      opacity: "opacity-70"
    }));

    setFiles(prev => [...prev, ...newFileEntries]);

    const formData = new FormData();
    queuedFiles.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        setVectorStoreId(data.vector_store_id);
        setQueuedFiles([]); // Clear queue on success
        setFiles(prev => prev.map(f =>
          newFileEntries.find(nf => nf.name === f.name)
            ? { ...f, status: "Processed", statusIcon: "check_circle", statusColor: "text-green-500", opacity: "" }
            : f
        ));
      } else {
        alert("Upload failed: " + JSON.stringify(data.errors));
        setFiles(prev => prev.filter(f => !newFileEntries.find(nf => nf.name === f.name)));
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading files");
    } finally {
      setIsUploading(false);
    }
  }

  const runExtraction = async () => {
    if (!vectorStoreId) {
      alert("Please upload a file first.");
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);
    setExtractionTimeMs(0);
    const activeKeys = keys.filter(k => selectedPrompts[k]);

    setExtractionFeed(activeKeys.map(k => ({ title: k, status: "WAITING..." })));

    // Process in batches of 7 to avoid OpenAI rate limit exhaustion while optimizing speed
    const batchSize = 7;
    let completedKeys = 0;

    // Accumulate answers to provide context to subsequent batches
    let accumulatedAnswers: Record<string, any> = {};

    for (let i = 0; i < activeKeys.length; i += batchSize) {
      const batch = activeKeys.slice(i, i + batchSize);

      // Update ui to show fetching for this current batch
      setExtractionFeed(prev => prev.map(feed =>
        batch.includes(feed.title) ? { ...feed, status: "FETCHING..." } : feed
      ));

      let batchPrompts: Record<string, string> = {};
      batch.forEach(k => batchPrompts[k] = texts[k]);

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchPrompts, vectorStoreId, contextData: accumulatedAnswers })
        });
        const data = await res.json();

        let batchResults: Record<string, any> = {};
        if (res.ok && data.raw) {
          try {
            batchResults = JSON.parse(data.raw);
          } catch (e) {
            console.error("Failed to parse batch json payload", data.raw);
          }
        }

        // REFINEMENT POST-PROCESSING STEP
        setExtractionFeed(prev => prev.map(feed =>
          batch.includes(feed.title) ? { ...feed, status: "REFINING..." } : feed
        ));

        let finalResultsToRender = batchResults;

        try {
          const refinePromise = await fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawJson: JSON.stringify(batchResults) })
          });

          const refineData = await refinePromise.json();
          if (refinePromise.ok && refineData.refinedJson) {
            try {
              const parsedRefined: Record<string, any> = JSON.parse(refineData.refinedJson);

              // Re-inject the metadata since the refinement agent often strips it
              for (const key of Object.keys(parsedRefined)) {
                if (batchResults[key]) {
                  const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
                  for (const mKey of metaKeys) {
                    if (batchResults[key][mKey] !== undefined) {
                      parsedRefined[key][mKey] = batchResults[key][mKey];
                    }
                  }
                }
              }

              finalResultsToRender = parsedRefined;
            } catch (e) {
              console.warn("Failed to parse refined JSON payload, falling back to raw.", refineData.refinedJson);
            }
          } else {
            console.warn("Refinement API returned error, skipping refine step:", refineData.error);
          }
        } catch (refineErr) {
          console.error("Refinement API request failed, skipping refine step:", refineErr);
        }

        // RED TEAM VALIDATION POST-PROCESSING STEP
        const tableKeys = batch.filter(k => k.includes('table'));
        if (tableKeys.length > 0) {
          setExtractionFeed(prev => prev.map(feed =>
            tableKeys.includes(feed.title) ? { ...feed, status: "VALIDATING..." } : feed
          ));

          await Promise.all(tableKeys.map(async (key) => {
            const rawObj = (finalResultsToRender as any)[key];
            if (!rawObj || Object.keys(rawObj).length === 0) return;

            const sourceQuote = rawObj.source_quote;

            try {
              const validatePromise = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyName: key, extractedData: rawObj, sourceQuote })
              });

              const validateData = await validatePromise.json();
              if (validatePromise.ok && validateData.validatedData) {
                const validatedObj = validateData.validatedData;
                // Preserve metadata
                const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
                for (const mKey of metaKeys) {
                  if (rawObj[mKey] !== undefined) validatedObj[mKey] = rawObj[mKey];
                }
                (finalResultsToRender as any)[key] = validatedObj;
              } else {
                console.warn(`Validation API returned error for ${key}:`, validateData.error);
              }
            } catch (valErr) {
              console.error(`Validation API request failed for ${key}:`, valErr);
            }
          }));
        }


        setExtractionFeed(prev => prev.map(feed => {
          if (!batch.includes(feed.title)) return feed;

          const finalObj = (finalResultsToRender as any)[feed.title] || {};

          // Extract metadata before stripping
          const confidenceScore = finalObj.confidence_score;
          const sourceQuote = finalObj.source_quote;
          const sourceFile = finalObj.source_file;
          const sourcePage = finalObj.source_page;
          const sourceSection = finalObj.source_section;

          // Strip "source" and citation fields appended by AI
          const keysToRemove = ['source', '_citations', 'citations', 'reasoning', 'confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
          for (const k of keysToRemove) {
            if (k in finalObj) {
              delete finalObj[k];
            }
          }

          let extractedText = "Failed to extract.";
          const dataObj = finalObj.data !== undefined ? finalObj.data : finalObj;

          if (Object.keys(dataObj).length > 0) {
            const value = Object.values(dataObj)[0];
            extractedText = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            // Accumulate successfully parsed object for next batch context
            Object.assign(accumulatedAnswers, dataObj);
          } else {
            extractedText = res.ok ? "AI returned empty for this key." : data.error || "Failed.";
          }

          return { ...feed, status: "COMPLETED", data: extractedText, parsedObj: dataObj, confidenceScore, sourceQuote, sourceFile, sourcePage, sourceSection };
        }));

      } catch (e) {
        console.error("Batch extraction failed:", e);
        setExtractionFeed(prev => prev.map(feed =>
          batch.includes(feed.title) ? { ...feed, status: "COMPLETED", data: "Error extracting." } : feed
        ));
      }

      completedKeys += batch.length;
      setExtractionProgress(Math.min(100, Math.round((completedKeys / activeKeys.length) * 100)));
    }

    setIsExtracting(false);
  }

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: currentFetchedAnswers, mappingName })
      });

      if (res.ok) {
        const blob = await res.blob();

        const contentDisposition = res.headers.get('Content-Disposition');
        let filename = "Generated_Documents.zip";
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          if (match && match[1]) {
            filename = match[1];
          }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } else {
        alert("Report generation failed.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating report");
    } finally {
      setIsGenerating(false);
    }
  }

  const [refiningKey, setRefiningKey] = useState<string | null>(null);
  const [refineInstructions, setRefineInstructions] = useState<Record<string, string>>({});

  const handleRefine = async (key: string, rawJson: string) => {
    if (!vectorStoreId) {
      alert("Please upload standard reference documents to refine.");
      return;
    }
    setRefiningKey(key);
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawJson,
          userInstructions: refineInstructions[key] || "",
          vectorStoreId
        })
      });
      const data = await res.json();
      if (res.ok && data.refinedJson) {
        const refinedObj = JSON.parse(data.refinedJson);
        const value = Object.values(refinedObj)[0];
        const extractedText = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        setExtractionFeed(prev => prev.map(feed =>
          feed.title === key ? { ...feed, data: extractedText, parsedObj: refinedObj } : feed
        ));
      } else {
        alert("Refinement failed.");
      }
    } catch (e) {
      console.error("Refinement error", e);
      alert("Error during refinement.");
    } finally {
      setRefiningKey(null);
    }
  };

  const renderEditableData = (feed: any) => {
    if (!feed.parsedObj) return null;
    const currentKey = Object.keys(feed.parsedObj)[0];
    const value = feed.parsedObj[currentKey];
    if (typeof value !== 'object' || value === null) return null;

    const handleUpdate = (newVal: any) => {
      setExtractionFeed(prev => prev.map(f =>
        f.title === feed.title ? { ...f, parsedObj: { [currentKey]: newVal }, data: JSON.stringify({ [currentKey]: newVal }, null, 2) } : f
      ));
    };

    // Fall through to JsonEditor for spreadsheet views so ADD/REMOVE ROW buttons work.

    let chartsArray = null;
    let isWrapped = false;
    if (Array.isArray(value)) {
      chartsArray = value;
    } else if (value.chart_data && Array.isArray(value.chart_data)) {
      chartsArray = value.chart_data;
      isWrapped = true;
    } else if (value["Key secondary endpoint results"] && Array.isArray(value["Key secondary endpoint results"])) {
      chartsArray = value["Key secondary endpoint results"];
      isWrapped = true;
    }

    if (chartsArray && chartsArray.length > 0 && typeof chartsArray[0] === 'object') {
      return (
        <div className="space-y-4 mt-4">
          {chartsArray.map((item: any, idx: number) => {
            const handleItemUpdate = (field: string, fieldVal: any) => {
              const newArr = [...chartsArray];
              newArr[idx] = { ...item, [field]: fieldVal };

              let newWrappedData = newArr;
              if (isWrapped) {
                if (value.chart_data) newWrappedData = { ...value, chart_data: newArr };
                if (value["Key secondary endpoint results"]) newWrappedData = { ...value, "Key secondary endpoint results": newArr };
              }
              handleUpdate(newWrappedData);
            };

            const handleDatasetUpdate = (dsIdx: number, valIdx: number, dsVal: string) => {
              const newArr = [...chartsArray];
              const newDatasets = [...item.data.datasets];
              const newDataArr = [...newDatasets[dsIdx].data];
              newDataArr[valIdx] = isNaN(Number(dsVal)) || dsVal.trim() === '' ? dsVal : Number(dsVal);
              newDatasets[dsIdx] = { ...newDatasets[dsIdx], data: newDataArr };
              newArr[idx] = { ...item, data: { ...item.data, datasets: newDatasets } };

              let newWrappedData = newArr;
              if (isWrapped) {
                if (value.chart_data) newWrappedData = { ...value, chart_data: newArr };
                if (value["Key secondary endpoint results"]) newWrappedData = { ...value, "Key secondary endpoint results": newArr };
              }
              handleUpdate(newWrappedData);
            };

            const isChart = item.chart_type && item.data;

            return (
              <div key={idx} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                {['question', 'primary_endpoint_results_conclusion', 'clinical_term_definition', 'primary_endpoint_results_assessment', 'Primary_endpoint_results', 'chart_title', 'answer'].map(keyField => {
                  if (item[keyField] !== undefined) {
                    return (
                      <div key={keyField} className="mb-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{keyField.replace(/_/g, ' ')}</label>
                        <textarea
                          className="w-full bg-white dark:bg-slate-900 border border-transparent rounded-md p-2 text-sm text-slate-700 dark:text-slate-300 resize-none outline-none focus:border-[var(--color-primary)] shadow-sm"
                          value={item[keyField]}
                          onChange={(e) => handleItemUpdate(keyField, e.target.value)}
                          rows={String(item[keyField]).length > 100 ? 5 : 2}
                        />
                      </div>
                    )
                  }
                  return null;
                })}

                {isChart && (
                  <div className="mt-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg overflow-x-auto shadow-sm">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-3 py-2 border-r border-slate-200 dark:border-slate-700 uppercase tracking-wider text-slate-500 font-bold">Category / Label</th>
                          {item.data.labels?.map((l: string, lIdx: number) => (
                            <th key={lIdx} className="px-3 py-2 border-r border-slate-200 dark:border-slate-700 text-center font-semibold">
                              {l}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {item.data.datasets?.map((ds: any, dsIdx: number) => (
                          <tr key={dsIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-700 font-medium whitespace-pre-wrap min-w-[120px]">
                              {ds.label}
                            </td>
                            {ds.data?.map((val: any, valIdx: number) => (
                              <td key={valIdx} className="px-3 py-2 border-r border-slate-200 dark:border-slate-700">
                                <input
                                  type="text"
                                  className="w-full bg-transparent text-center outline-none border-b border-transparent focus:border-[var(--color-primary)]"
                                  value={val}
                                  onChange={(e) => handleDatasetUpdate(dsIdx, valIdx, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <JsonEditor
        data={feed.parsedObj}
        onUpdate={(newVal) => {
          setExtractionFeed(prev => prev.map(f =>
            f.title === feed.title ? { ...f, parsedObj: newVal, data: JSON.stringify(newVal, null, 2) } : f
          ));
        }}
      />
    );
  };

  const currentFetchedAnswers = extractionFeed
    .filter(f => f.status === 'COMPLETED' && f.parsedObj)
    .reduce((acc, feed) => {
      const keyIndex = keys.indexOf(feed.title);
      let finalKey = feed.title;
      if (keyIndex !== -1) {
        const m = mapping[String(keyIndex + 1) as keyof typeof mapping] as any;
        if (m) {
          if (m.placeholder) finalKey = m.placeholder;
          else if (m.table_placeholder) finalKey = m.table_placeholder.replace(/^{{/, '').replace(/}}$/, '');
        }
      }
      return { ...acc, [finalKey]: feed.parsedObj };
    }, {});

  const handleChatbotUpdate = (keyToUpdate: string, newValue: any) => {
    setExtractionFeed(prev => prev.map(feed => {
      const keyIndex = keys.indexOf(feed.title);
      let finalKey = feed.title;
      if (keyIndex !== -1) {
        const m = mapping[String(keyIndex + 1) as keyof typeof mapping] as any;
        if (m) {
          if (m.placeholder) finalKey = m.placeholder;
          else if (m.table_placeholder) finalKey = m.table_placeholder.replace(/^{{/, '').replace(/}}$/, '');
        }
      }

      if (finalKey === keyToUpdate) {
        return {
          ...feed,
          parsedObj: newValue,
          data: typeof newValue === 'object' ? JSON.stringify(newValue, null, 2) : String(newValue)
        };
      }
      return feed;
    }));
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3 shrink-0">
        <div className="flex items-center gap-6">
          <img src="/krystelis_logo.svg" alt="Krystelis Logo" className="h-10 w-auto object-contain" />
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-[13px] text-slate-500">bolt</span>
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">Powered by OpenAI</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            System Online
          </div>
          <button onClick={generateReport} disabled={isGenerating} className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50">
            {isGenerating ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-lg">description</span>
            )}
            <span>{isGenerating ? "Generating..." : "Generate Word Document"}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-96 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 flex flex-col gap-6">

            {/* Configuration */}
            <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Configuration</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mapping Profile</label>
                  <select
                    value={mappingName}
                    onChange={(e) => setMappingName(e.target.value)}
                    className="w-full rounded-md border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm p-2 outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="results_PLS">Results PLS</option>
                    <option value="protocol_PLS">Protocol PLS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Readability Level</label>
                  <select
                    value={readabilityLevel}
                    onChange={(e) => setReadabilityLevel(e.target.value)}
                    className="w-full rounded-md border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm p-2 outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="2nd Grade">2nd Grade</option>
                    <option value="4th Grade">4th Grade</option>
                    <option value="6th Grade">6th Grade</option>
                    <option value="Non-technical Healthcare Professional">Non-technical Healthcare Professional</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Upload Zone */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</h3>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-[var(--color-primary)]/50 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.docx,.txt"
                />
                <span className="material-symbols-outlined text-3xl text-[var(--color-primary)]">
                  note_add
                </span>
                <div className="text-center text-sm">
                  <p className="font-medium text-slate-900 dark:text-white">
                    Select Documents
                  </p>
                  <p className="text-slate-500 text-xs mt-1">Add files to queue</p>
                </div>
              </div>

              {queuedFiles.length > 0 && (
                <button
                  onClick={uploadToVectorStore}
                  disabled={isUploading}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  )}
                  {isUploading ? "Uploading..." : `Upload ${queuedFiles.length} File${queuedFiles.length > 1 ? 's' : ''} to Vector Store`}
                </button>
              )}

              <button
                onClick={runExtraction}
                disabled={isUploading || !vectorStoreId || isExtracting || queuedFiles.length > 0}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {isExtracting ? "Extracting..." : "Run AI Extraction"}
              </button>
            </div>

            {/* AI Prompts Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">lightbulb</span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Prompts</h3>
                </div>
                <button
                  onClick={() => {
                    const allSelected = keys.every(k => selectedPrompts[k]);
                    const newSelections: Record<string, boolean> = {};
                    keys.forEach(k => newSelections[k] = !allSelected);
                    setSelectedPrompts(newSelections);
                  }}
                  className="text-xs text-[var(--color-primary)] hover:underline font-medium">
                  Toggle All
                </button>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {keys.map(key => (
                  <label key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 cursor-pointer border border-transparent hover:border-[var(--color-primary)]/20 group">
                    <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate pr-2">{key.replace(/_/g, ' ')}</span>
                    <input
                      checked={!!selectedPrompts[key]}
                      onChange={(e) => setSelectedPrompts({ ...selectedPrompts, [key]: e.target.checked })}
                      className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] h-3.5 w-3.5"
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Uploaded Files List */}
            {(queuedFiles.length > 0 || files.length > 0) && (
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Files</h3>
                <div className="space-y-2">
                  {queuedFiles.map((file, idx) => (
                    <div key={`q-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/10`}>
                      <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">{file.name.endsWith('.pdf') ? "description" : "receipt_long"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-amber-600/70">{(file.size / 1024 / 1024).toFixed(2)} MB • Queued</p>
                      </div>
                      <button onClick={() => setQueuedFiles(prev => prev.filter(f => f.name !== file.name))} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Remove file">
                        <span className="material-symbols-outlined text-lg block">close</span>
                      </button>
                    </div>
                  ))}

                  {files.map((file, idx) => (
                    <div key={`f-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 ${file.opacity}`}>
                      <div className="w-10 h-10 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-lg flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">{file.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">{file.size} • {file.status}</p>
                      </div>
                      <span className={`material-symbols-outlined ${file.statusColor} text-xl`}>{file.statusIcon}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Workspace - Single Column Editing Feed */}
        <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col gap-3 shadow-sm z-10">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--color-primary)]">edit_document</span>
                AI Extraction & Refinement Feed
              </h2>
              <div className="flex items-center gap-3">
                {extractionTimeMs > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-300 text-xs font-mono font-medium">
                    <span className="material-symbols-outlined text-[14px]">timer</span>
                    {formatTime(extractionTimeMs)}
                  </div>
                )}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] italic">Live Interactive Document</span>
              </div>
            </div>

            {/* Progress Bar */}
            {(isExtracting || (extractionProgress === 100 && extractionFeed.length > 0)) && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between items-center text-xs font-medium text-slate-500">
                  <span>{isExtracting ? 'Extracting Data...' : 'Extraction Complete'}</span>
                  <span>{extractionProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${extractionProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-6">
              {extractionFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <span className="material-symbols-outlined text-4xl mb-2 text-slate-300 dark:text-slate-600">article</span>
                  <p className="text-sm font-medium">Run AI Extraction to begin building the document.</p>
                </div>
              ) : (
                extractionFeed.map((feed, idx) => (
                  <div key={idx} className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-all ${feed.status === 'FETCHING...' ? 'border-l-4 border-l-[var(--color-primary)] animate-pulse' : 'hover:border-[var(--color-primary)]/40'}`}>
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-wide flex items-center gap-2">
                          {feed.title.replace(/_/g, ' ')}
                        </h3>
                        {feed.confidenceScore !== undefined && (
                          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${feed.confidenceScore >= 85 ? 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20' : feed.confidenceScore >= 70 ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'}`} title="AI Confidence Score (Based on Source Alignment)">
                            <span className="material-symbols-outlined text-[12px]">
                              {feed.confidenceScore >= 85 ? 'verified' : 'warning'}
                            </span>
                            {feed.confidenceScore}% CONFIDENCE
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {feed.sourceQuote && (
                          <button
                            onClick={() => alert(`Source Snippet Document Proof: \n\n"${feed.sourceQuote}"\n\nFile: ${feed.sourceFile || 'Unknown'}\nSection: ${feed.sourceSection || 'Unknown'}\nPage: ${feed.sourcePage || 'Unknown'}`)}
                            className="text-[10px] font-bold text-slate-500 hover:text-[var(--color-primary)] bg-slate-100 dark:bg-slate-800 hover:bg-[var(--color-primary)]/10 px-2.5 py-1 flex items-center gap-1 rounded transition-colors mr-2 border border-transparent hover:border-[var(--color-primary)]/20"
                            title="View source quote"
                          >
                            <span className="material-symbols-outlined text-[13px]">format_quote</span>
                            VIEW SOURCE
                          </button>
                        )}
                        {feed.status === 'FETCHING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse"></div>
                            <span className="text-[10px] font-bold text-[var(--color-primary)]">EXTRACTING</span>
                          </div>
                        ) : feed.status === 'REFINING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-amber-500">REFINING</span>
                          </div>
                        ) : feed.status === 'WAiTING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                            <span className="material-symbols-outlined text-[12px] opacity-50 px-0.5">more_horiz</span>
                            <span className="text-[10px] font-bold text-slate-500">QUEUED</span>
                          </div>
                        ) : feed.status === 'VALIDATING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-800">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-purple-600">VALIDATING</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 shadow-sm border border-green-200 px-2 py-1 rounded flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check</span> READY
                          </span>
                        )}
                      </div>
                    </div>

                    {feed.status === 'FETCHING...' || feed.status === 'WAITING...' || feed.status === 'REFINING...' || feed.status === 'VALIDATING...' ? (
                      <div className={`space-y-3 ${feed.status === 'WAITING...' ? 'opacity-30' : 'animate-pulse'}`}>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-5/6"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-4/6"></div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {typeof Object.values(feed.parsedObj || {})[0] !== 'object' && (
                          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-800 relative group">
                            <textarea
                              className="w-full bg-transparent text-sm text-slate-700 dark:text-slate-300 resize-none outline-none min-h-[60px]"
                              value={String(Object.values(feed.parsedObj || {})[0])}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                const currentKey = Object.keys(feed.parsedObj)[0];
                                setExtractionFeed(prev => prev.map(f =>
                                  f.title === feed.title ? { ...f, data: newVal, parsedObj: { [currentKey]: newVal } } : f
                                ));
                              }}
                              rows={feed.data ? feed.data.split('\n').length : 3}
                            />
                          </div>
                        )}

                        {renderEditableData(feed)}

                        <div className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                          <input
                            type="text"
                            placeholder="Optional: instructions for AI refinement (e.g. 'Make it shorter')"
                            className="flex-1 text-xs px-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:border-[var(--color-primary)]"
                            value={refineInstructions[feed.title] || ""}
                            onChange={(e) => setRefineInstructions({ ...refineInstructions, [feed.title]: e.target.value })}
                          />
                          <button
                            onClick={() => handleRefine(feed.title, JSON.stringify(feed.parsedObj))}
                            disabled={refiningKey === feed.title}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[14px]">{refiningKey === feed.title ? 'hourglass_empty' : 'auto_fix_high'}</span>
                            {refiningKey === feed.title ? 'Refining...' : 'Refine with AI'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Floating Chatbot Widget */}
      <Chatbot
        vectorStoreId={vectorStoreId}
        fetchedAnswers={currentFetchedAnswers}
        onUpdateData={handleChatbotUpdate}
      />
    </div>
  )
}

