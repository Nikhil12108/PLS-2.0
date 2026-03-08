"use client"

import React, { useState, useRef, useEffect } from 'react'
import { extractPrompts } from '@/utils/promptLoader'
import { JsonEditor } from '@/components/JsonEditor'
import { Chatbot } from '@/components/Chatbot'

// ============ TEST DATA FOR UI DEVELOPMENT ============
const MOCK_EXTRACTION_DATA = [
  {
    title: "title_prompt",
    status: "COMPLETED",
    data: "A clinical trial to learn more about the effects of WVT078 in people with advanced cancer",
    parsedObj: { "title": "A clinical trial to learn more about the effects of WVT078 in people with advanced cancer" },
    confidenceScore: 96,
    reasoning: "The title was clearly stated on the title page of the protocol document. I simplified the medical terminology to make it accessible for a general audience while preserving the key information about the drug and condition.",
    sourceQuote: "A Phase I, Open-label, Multi-center, Dose Escalation Study of WVT078 as a Single Agent and in Combination with WHG626 in Patients with Advanced Solid Tumors",
    sourceFile: "WVT078A12101 Protocol - v05_0.docx",
    sourcePage: "Title Page",
    sourceSection: "Study Title"
  },
  {
    title: "primary_objective_prompt",
    status: "COMPLETED",
    data: JSON.stringify({ "Primary Objective": ["To find out if WVT078 is safe when given alone", "To find out the best dose of WVT078 for future trials"] }, null, 2),
    parsedObj: { "Primary Objective": ["To find out if WVT078 is safe when given alone", "To find out the best dose of WVT078 for future trials"] },
    confidenceScore: 92,
    reasoning: "Primary objectives were explicitly listed in the protocol summary. I translated technical terms like 'DLTs' and 'SAEs' into plain language. Confidence is high but not 100% because objectives spanned multiple subsections.",
    sourceQuote: "Primary Objective(s)\nTo characterize the safety, tolerability, and determine recommended dose regimen of single agent WVT078 and WVT078 in combination with WHG626 for future studies, by assessing the incidence and severity of DLTs, AEs, and SAEs and the frequency of dose interruptions, discontinuations and reductions",
    sourceFile: "WVT078A12101 Protocol - v05_0.docx; CWVT078A12101 Report Body V1.0.docx",
    sourcePage: "Protocol summary page; Page 15",
    sourceSection: "Primary Objective(s); 1.2 Study Objectives"
  },
  {
    title: "health_condition_prompt",
    status: "COMPLETED",
    data: "Advanced solid tumors (cancer)",
    parsedObj: { "Health condition": "Advanced solid tumors (cancer)" },
    confidenceScore: 98,
    reasoning: "The health condition is unambiguously stated in the study title and inclusion criteria. Added parenthetical clarification for lay readers.",
    sourceQuote: "in Patients with Advanced Solid Tumors",
    sourceFile: "WVT078A12101 Protocol - v05_0.docx",
    sourcePage: "Page 1",
    sourceSection: "Title"
  },
  {
    title: "total_number_of_countries_prompt",
    status: "COMPLETED",
    data: "56 participants from 8 countries received treatment.",
    parsedObj: { "Total number of countries": "56 participants from 8 countries received treatment." },
    confidenceScore: 99,
    reasoning: "The participant count and country information was found in the Results Disclosure Form and corroborated by the Report Body. Both sources agree on the numbers.",
    sourceQuote: "Centers 12 centers in 8 countries: United States(3), Germany(2), Spain(2), Israel(1), Japan(1), Italy(1), Australia(1), Norway(1). ... All 56 participants received at least one prior antineoplastic therapy.",
    sourceFile: "CWVT078A12101_Results Disclosure Form_NovCTR_v1.docx; CWVT078A12101 Report Component Report Body V1.0.docx",
    sourcePage: "Results Disclosure Form Summary; Page 47",
    sourceSection: "Centers; Prior and concomitant therapies"
  },
  {
    title: "race_table_prompt",
    status: "COMPLETED",
    data: JSON.stringify({
      "race_table": {
        "headers": ["Race", "Number of Participants", "Percentage"],
        "rows": [
          ["White or Caucasian", "145", "72%"],
          ["Asian", "35", "18%"],
          ["Black or African American", "15", "8%"],
          ["Other", "5", "2%"]
        ]
      }
    }, null, 2),
    parsedObj: {
      "race_table": {
        "headers": ["Race", "Number of Participants", "Percentage"],
        "rows": [
          ["White or Caucasian", "145", "72%"],
          ["Asian", "35", "18%"],
          ["Black or African American", "15", "8%"],
          ["Other", "5", "2%"]
        ]
      }
    },
    confidenceScore: 78,
    reasoning: "Demographics table found but percentages were calculated from the raw numbers. Some categories in the source were combined for simplicity. Medium confidence due to data aggregation.",
    sourceQuote: "Demographics are summarized in Table 14.1.4. The majority of participants were White (72.5%), with Asian (17.5%) and Black or African American (7.5%) participants also enrolled.",
    sourceFile: "WVT078A12101 CSR.pdf; CWVT078A12101 Report Body V1.0.docx",
    sourcePage: "Page 45; Page 52",
    sourceSection: "Table 14.1.4 Demographics; 11.2 Demographic and Baseline Characteristics"
  },
  {
    title: "adverse_events_prompt",
    status: "COMPLETED",
    data: JSON.stringify({
      "common_adverse_events": {
        "headers": ["Adverse Event", "Percentage", "Severity"],
        "rows": [
          ["Nausea", "45%", "Mild"],
          ["Fatigue", "38%", "Mild to Moderate"],
          ["Headache", "22%", "Mild"],
          ["Decreased appetite", "18%", "Mild"]
        ]
      }
    }, null, 2),
    parsedObj: {
      "common_adverse_events": {
        "headers": ["Adverse Event", "Percentage", "Severity"],
        "rows": [
          ["Nausea", "45%", "Mild"],
          ["Fatigue", "38%", "Mild to Moderate"],
          ["Headache", "22%", "Mild"],
          ["Decreased appetite", "18%", "Mild"]
        ]
      }
    },
    confidenceScore: 65,
    reasoning: "Adverse events were mentioned in narrative form but exact percentages required interpretation of multiple tables. Low confidence because the source text was fragmented and some values were approximated.",
    sourceQuote: "The most frequently reported adverse events were gastrointestinal disorders including nausea...",
    sourceFile: "WVT078A12101 CSR.pdf",
    sourcePage: "Page 78; Page 82; Page 85",
    sourceSection: "6.1 Adverse Events; Table 14.3.1; Safety Summary"
  },
  {
    title: "study_design_prompt",
    status: "COMPLETED",
    data: "This was a Phase 1, open-label trial to test WVT078 in participants with advanced cancer. The trial had 2 parts: Part 1 tested increasing doses, and Part 2 tested the drug combined with WHG626.",
    parsedObj: { "Study Design": "This was a Phase 1, open-label trial to test WVT078 in participants with advanced cancer. The trial had 2 parts: Part 1 tested increasing doses, and Part 2 tested the drug combined with WHG626." },
    confidenceScore: 89,
    reasoning: "Study design clearly documented in multiple sections. Simplified the dose escalation terminology for lay readers.",
    sourceQuote: "This is a Phase I, open-label, multi-center dose escalation study... The study consists of two parts: Part 1 (dose escalation of single agent WVT078) and Part 2 (combination with WHG626).",
    sourceFile: "WVT078A12101 Protocol - v05_0.docx",
    sourcePage: "Page 12",
    sourceSection: "3.1 Study Design"
  }
];

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
    const accumulatedAnswers: Record<string, any> = {};

    for (let i = 0; i < activeKeys.length; i += batchSize) {
      const batch = activeKeys.slice(i, i + batchSize);

      // Update ui to show fetching for this current batch
      setExtractionFeed(prev => prev.map(feed =>
        batch.includes(feed.title) ? { ...feed, status: "FETCHING..." } : feed
      ));

      const batchPrompts: Record<string, string> = {};
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
            console.log("PARSED BATCH RESULTS:", JSON.stringify(batchResults, null, 2));
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
          console.log("REFINE API RESPONSE:", JSON.stringify(refineData, null, 2));

          if (refinePromise.ok && refineData.refinedJson) {
            try {
              const parsedRefined: Record<string, any> = JSON.parse(refineData.refinedJson);
              console.log("PARSED REFINED KEYS:", Object.keys(parsedRefined));
              console.log("ORIGINAL BATCH KEYS:", Object.keys(batchResults));

              // Re-inject the metadata since the refinement agent ALWAYS strips it
              // The metadata is stored at the root level of each key's object in batchResults, or sometimes under 'data'
              const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section', 'reasoning'];

              for (const key of Object.keys(batchResults)) {
                const originalObj = batchResults[key];

                // Try to find matching key in parsedRefined (might have _prompt suffix or not)
                const possibleKeys = [key, key + '_prompt', key.replace(/_prompt$/, '')];
                let refinedObj = null;
                let matchedKey = key;
                for (const pk of possibleKeys) {
                  if (parsedRefined[pk]) {
                    refinedObj = parsedRefined[pk];
                    matchedKey = pk;
                    break;
                  }
                }

                console.log(`[REINJECT] key="${key}" -> matchedKey="${matchedKey}", found=${!!refinedObj}`);

                if (originalObj && refinedObj) {
                  for (const mKey of metaKeys) {
                    // It could be at the root or under data
                    const originalVal = originalObj[mKey] !== undefined ? originalObj[mKey] : originalObj.data?.[mKey];
                    if (originalVal !== undefined) {
                      refinedObj[mKey] = originalVal;
                      console.log(`[REINJECT] Copied ${mKey}=${originalVal} to refined object`);
                    }
                  }
                  // Ensure the parsedRefined uses the original key (not _prompt version)
                  if (matchedKey !== key) {
                    parsedRefined[key] = refinedObj;
                    delete parsedRefined[matchedKey];
                  }
                } else if (originalObj && !refinedObj) {
                  // Refinement didn't include this key, use original WITH metadata
                  console.log(`[REINJECT] No refined match for "${key}", using original with metadata`);
                  parsedRefined[key] = originalObj;
                }
              }

              console.log("METADATA RE-INJECTION COMPLETE:", JSON.stringify(parsedRefined, null, 2));

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
                // Preserve metadata (including reasoning!)
                const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section', 'reasoning'];
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

          // Try multiple key variations since AI might return with/without _prompt suffix
          const keyVariations = [
            feed.title,
            feed.title + '_prompt',
            feed.title.replace(/_prompt$/, ''),
          ];

          let finalObj: any = {};
          let matchedKey = feed.title;
          for (const keyVar of keyVariations) {
            if ((finalResultsToRender as any)[keyVar]) {
              finalObj = (finalResultsToRender as any)[keyVar];
              matchedKey = keyVar;
              break;
            }
          }

          // DEBUG: Log the finalObj structure to understand metadata location
          console.log(`[${feed.title}] matched key: "${matchedKey}", finalObj BEFORE extraction:`, JSON.stringify(finalObj, null, 2));
          console.log(`[${feed.title}] Available keys in finalResultsToRender:`, Object.keys(finalResultsToRender));

          // Extract metadata before stripping (including reasoning)
          // Some models put metadata inside `finalObj`, some put it inside `finalObj.data` or at the root if `data` is missing
          const confidenceScore = finalObj.confidence_score !== undefined ? finalObj.confidence_score : finalObj.data?.confidence_score;
          const sourceQuote = finalObj.source_quote !== undefined ? finalObj.source_quote : finalObj.data?.source_quote;
          const sourceFile = finalObj.source_file !== undefined ? finalObj.source_file : finalObj.data?.source_file;
          const sourcePage = finalObj.source_page !== undefined ? finalObj.source_page : finalObj.data?.source_page;
          const sourceSection = finalObj.source_section !== undefined ? finalObj.source_section : finalObj.data?.source_section;
          const reasoning = finalObj.reasoning !== undefined ? finalObj.reasoning : finalObj.data?.reasoning;

          // DEBUG: Log extracted metadata
          console.log(`[${feed.title}] EXTRACTED METADATA:`, { confidenceScore, sourceQuote, sourceFile, sourcePage, sourceSection, reasoning });

          // Strip "source" and citation fields appended by AI (but we've already saved them above)
          const keysToRemove = ['source', '_citations', 'citations', 'reasoning', 'confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
          for (const k of keysToRemove) {
            if (k in finalObj) {
              delete finalObj[k];
            }
            if (finalObj.data && typeof finalObj.data === 'object' && k in finalObj.data) {
              delete finalObj.data[k];
            }
          }

          let extractedText = "Failed to extract.";
          const dataObj = finalObj.data !== undefined ? finalObj.data : finalObj;

          if (dataObj && Object.keys(dataObj).length > 0) {
            // Because the expected output puts the actual data inside another object (or directly), we might have { [key]: { ... } }
            // Let's ensure dataObj is the actual useful data. If dataObj is like { data: { ... } }, finalObj.data already handled it.
            const value = Object.values(dataObj)[0];
            extractedText = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            // Accumulate successfully parsed object for next batch context
            Object.assign(accumulatedAnswers, dataObj);
          } else {
            extractedText = res.ok ? "AI returned empty for this key." : data.error || "Failed.";
          }

          const newFeed = { ...feed, status: "COMPLETED", data: extractedText, parsedObj: dataObj, confidenceScore, sourceQuote, sourceFile, sourcePage, sourceSection, reasoning };
          console.log(`[${feed.title}] FINAL FEED OBJECT:`, newFeed);
          return newFeed;
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
        setExtractionFeed(prev => prev.map(feed => {
          if (feed.title === key) {
             // Preserve metadata fields when setting parsedObj
             // We keep feed.confidenceScore, feed.reasoning etc intact in the top level `feed`
             return { ...feed, data: extractedText, parsedObj: refinedObj };
          }
          return feed;
        }));
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

    // ========== EDITABLE TABLE RENDERING (headers + rows format) ==========
    // Check if value has table structure: { headers: [...], rows: [[...], [...]] }
    const isTableFormat = value.headers && Array.isArray(value.headers) && value.rows && Array.isArray(value.rows);

    if (isTableFormat) {
      const handleHeaderChange = (colIdx: number, newHeader: string) => {
        const newHeaders = [...value.headers];
        newHeaders[colIdx] = newHeader;
        handleUpdate({ ...value, headers: newHeaders });
      };

      const handleCellChange = (rowIdx: number, colIdx: number, newValue: string) => {
        const newRows = value.rows.map((row: string[], rIdx: number) =>
          rIdx === rowIdx ? row.map((cell: string, cIdx: number) => cIdx === colIdx ? newValue : cell) : [...row]
        );
        handleUpdate({ ...value, rows: newRows });
      };

      const handleAddRow = () => {
        const newRow = new Array(value.headers.length).fill('');
        handleUpdate({ ...value, rows: [...value.rows, newRow] });
      };

      const handleRemoveRow = (rowIdx: number) => {
        const newRows = value.rows.filter((_: any, idx: number) => idx !== rowIdx);
        handleUpdate({ ...value, rows: newRows });
      };

      const handleAddColumn = () => {
        const newHeaders = [...value.headers, `Column ${value.headers.length + 1}`];
        const newRows = value.rows.map((row: string[]) => [...row, '']);
        handleUpdate({ headers: newHeaders, rows: newRows });
      };

      const handleRemoveColumn = (colIdx: number) => {
        const newHeaders = value.headers.filter((_: any, idx: number) => idx !== colIdx);
        const newRows = value.rows.map((row: string[]) => row.filter((_: any, idx: number) => idx !== colIdx));
        handleUpdate({ headers: newHeaders, rows: newRows });
      };

      return (
        <div className="mt-4 space-y-3">
          <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/80 border-b-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-2 py-2 w-10 text-center text-slate-400 text-xs">#</th>
                    {value.headers.map((header: string, colIdx: number) => (
                      <th key={colIdx} className="px-3 py-2 border-l border-slate-200 dark:border-slate-700 min-w-[120px]">
                        <div className="flex items-start gap-1">
                          <textarea
                            className="flex-1 bg-transparent font-bold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider outline-none border-b-2 border-transparent focus:border-[var(--color-primary)] py-1 resize-none leading-tight"
                            value={header}
                            onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                            rows={header.includes('\n') ? header.split('\n').length : 1}
                          />
                          <button
                            onClick={() => handleRemoveColumn(colIdx)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                            title="Remove column"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {value.rows.map((row: string[], rowIdx: number) => (
                    <tr key={rowIdx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-2 py-2 text-center text-slate-400 text-xs font-mono align-top">{rowIdx + 1}</td>
                      {row.map((cell: string, colIdx: number) => (
                        <td key={colIdx} className="px-3 py-2 border-l border-slate-200 dark:border-slate-700 align-top">
                          <textarea
                            className="w-full bg-transparent text-slate-700 dark:text-slate-300 text-sm outline-none border-b border-transparent focus:border-[var(--color-primary)] py-0.5 resize-none leading-tight"
                            value={cell}
                            onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                            rows={cell && cell.includes('\n') ? cell.split('\n').length : 1}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 align-top">
                        <button
                          onClick={() => handleRemoveRow(rowIdx)}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove row"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg border border-green-200 dark:border-green-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Add Row
            </button>
            <button
              onClick={handleAddColumn}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Add Column
            </button>
          </div>
        </div>
      );
    }

    // ========== ARRAY-OF-OBJECTS AS TABLE (e.g., adverse_events) ==========
    // Check if value is an array of simple objects (like [{event: "X", percentage: "Y"}])
    const isArrayOfObjects = Array.isArray(value) && value.length > 0 &&
      typeof value[0] === 'object' && value[0] !== null &&
      !value[0].chart_type && !value[0].data && !value[0].question; // Not a chart item

    if (isArrayOfObjects) {
      const headers = Object.keys(value[0]);

      const handleArrayCellChange = (rowIdx: number, colKey: string, newValue: string) => {
        const newArray = value.map((row: any, rIdx: number) =>
          rIdx === rowIdx ? { ...row, [colKey]: newValue } : row
        );
        handleUpdate(newArray);
      };

      const handleArrayAddRow = () => {
        const newRow: any = {};
        headers.forEach(h => newRow[h] = '');
        handleUpdate([...value, newRow]);
      };

      const handleArrayRemoveRow = (rowIdx: number) => {
        handleUpdate(value.filter((_: any, idx: number) => idx !== rowIdx));
      };

      return (
        <div className="mt-4 space-y-3">
          <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/80 border-b-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-2 py-2 w-10 text-center text-slate-400 text-xs">#</th>
                    {headers.map((header: string, colIdx: number) => (
                      <th key={colIdx} className="px-3 py-2 border-l border-slate-200 dark:border-slate-700 min-w-[120px]">
                        <span className="font-bold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider">
                          {header.replace(/_/g, ' ')}
                        </span>
                      </th>
                    ))}
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {value.map((row: any, rowIdx: number) => (
                    <tr key={rowIdx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-2 py-2 text-center text-slate-400 text-xs font-mono">{rowIdx + 1}</td>
                      {headers.map((colKey: string, colIdx: number) => (
                        <td key={colIdx} className="px-3 py-2 border-l border-slate-200 dark:border-slate-700">
                          <input
                            type="text"
                            className="w-full bg-transparent text-slate-700 dark:text-slate-300 text-sm outline-none border-b border-transparent focus:border-[var(--color-primary)] py-0.5"
                            value={row[colKey] || ''}
                            onChange={(e) => handleArrayCellChange(rowIdx, colKey, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleArrayRemoveRow(rowIdx)}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove row"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleArrayAddRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded-lg border border-green-200 dark:border-green-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Add Row
            </button>
          </div>
        </div>
      );
    }

    // ========== CHART/ARRAY DATA RENDERING ==========
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

  // Data for Word doc generation (no metadata)
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

  // Full context WITH metadata for chatbot (helps explain confidence/sources to writers)
  const chatbotContextWithMetadata = extractionFeed
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
      return {
        ...acc,
        [finalKey]: {
          data: feed.parsedObj,
          metadata: {
            confidence_score: feed.confidenceScore,
            source_quote: feed.sourceQuote,
            source_file: feed.sourceFile,
            source_page: feed.sourcePage,
            source_section: feed.sourceSection
          }
        }
      };
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
          {/* TEST MODE BUTTON - Load mock data for UI testing */}
          <button
            onClick={() => {
              setExtractionFeed(MOCK_EXTRACTION_DATA);
              setVectorStoreId("test_vector_store_id");
            }}
            className="flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border border-purple-200 dark:border-purple-800"
            title="Load mock data to test UI elements without API calls"
          >
            <span className="material-symbols-outlined text-sm">science</span>
            <span>Test Mode</span>
          </button>
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
                        {(feed.sourceFile || feed.sourcePage || feed.sourceSection) && (
                          <div className="relative group">
                            {/* Compact metadata badges */}
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                              {feed.sourceFile && (
                                <span className="flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[11px]">description</span>
                                  {feed.sourceFile.length > 15 ? feed.sourceFile.slice(0, 15) + '...' : feed.sourceFile}
                                </span>
                              )}
                              {feed.sourcePage && (
                                <span className="flex items-center gap-0.5 border-l border-slate-300 dark:border-slate-600 pl-1.5">
                                  <span className="material-symbols-outlined text-[11px]">article</span>
                                  {feed.sourcePage.length > 10 ? feed.sourcePage.slice(0, 10) + '...' : feed.sourcePage}
                                </span>
                              )}
                              {feed.sourceSection && (
                                <span className="flex items-center gap-0.5 border-l border-slate-300 dark:border-slate-600 pl-1.5 max-w-[80px] truncate">
                                  <span className="material-symbols-outlined text-[11px]">bookmark</span>
                                  {feed.sourceSection}
                                </span>
                              )}
                              <span className="material-symbols-outlined text-[10px] text-slate-400 ml-0.5">info</span>
                            </div>

                            {/* Hover Popup - Full metadata details */}
                            <div className="absolute right-0 top-full mt-2 z-50 hidden group-hover:block animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-3 min-w-[280px] max-w-[400px]">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">info</span>
                                  Source Metadata
                                </div>
                                <div className="space-y-2">
                                  {feed.sourceFile && (
                                    <div className="flex items-start gap-2">
                                      <span className="material-symbols-outlined text-[14px] text-blue-500 mt-0.5">description</span>
                                      <div>
                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Source File</div>
                                        <div className="text-xs text-slate-700 dark:text-slate-300 break-all">{feed.sourceFile}</div>
                                      </div>
                                    </div>
                                  )}
                                  {feed.sourcePage && (
                                    <div className="flex items-start gap-2">
                                      <span className="material-symbols-outlined text-[14px] text-green-500 mt-0.5">article</span>
                                      <div>
                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Page</div>
                                        <div className="text-xs text-slate-700 dark:text-slate-300">{feed.sourcePage}</div>
                                      </div>
                                    </div>
                                  )}
                                  {feed.sourceSection && (
                                    <div className="flex items-start gap-2">
                                      <span className="material-symbols-outlined text-[14px] text-purple-500 mt-0.5">bookmark</span>
                                      <div>
                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Section</div>
                                        <div className="text-xs text-slate-700 dark:text-slate-300">{feed.sourceSection}</div>
                                      </div>
                                    </div>
                                  )}
                                  {feed.confidenceScore !== undefined && (
                                    <div className="flex items-start gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                      <span className="material-symbols-outlined text-[14px] text-amber-500 mt-0.5">speed</span>
                                      <div>
                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">AI Confidence</div>
                                        <div className={`text-xs font-bold ${feed.confidenceScore >= 85 ? 'text-green-600' : feed.confidenceScore >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                          {feed.confidenceScore}% {feed.confidenceScore >= 85 ? '(High)' : feed.confidenceScore >= 70 ? '(Medium)' : '(Low - Review Recommended)'}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                  <p className="text-[9px] text-slate-400 italic">💡 Expand "Source Evidence" below for full quote</p>
                                </div>
                              </div>
                            </div>
                          </div>
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

                        {/* Source Evidence & Reasoning Panel - Collapsible */}
                        {(feed.sourceQuote || feed.reasoning) && (
                          <details className="group mt-3">
                            <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-[var(--color-primary)] transition-colors select-none">
                              <span className="material-symbols-outlined text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
                              <span className="material-symbols-outlined text-[14px] text-blue-500">verified_user</span>
                              Source Evidence & AI Reasoning
                            </summary>
                            <div className="mt-2 space-y-3">

                              {/* AI Reasoning Tab */}
                              {feed.reasoning && (
                                <div className="p-3 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/50 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-purple-500 text-[14px]">psychology</span>
                                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">AI Reasoning</span>
                                  </div>
                                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {feed.reasoning}
                                  </p>
                                </div>
                              )}

                              {/* Source Quote */}
                              {feed.sourceQuote && (
                                <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-blue-500 text-[14px]">format_quote</span>
                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Source Quote</span>
                                  </div>
                                  <blockquote className="text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed bg-white/50 dark:bg-slate-800/50 p-2 rounded border-l-2 border-blue-400">
                                    "{feed.sourceQuote}"
                                  </blockquote>
                                </div>
                              )}

                              {/* Source References - Handles Multiple Sources */}
                              {(feed.sourceFile || feed.sourcePage || feed.sourceSection) && (
                                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-slate-500 text-[14px]">source</span>
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Source References</span>
                                  </div>

                                  {/* Parse semicolon-separated sources into individual items */}
                                  {(() => {
                                    const files = feed.sourceFile?.split(';').map((s: string) => s.trim()).filter(Boolean) || [];
                                    const pages = feed.sourcePage?.split(';').map((s: string) => s.trim()).filter(Boolean) || [];
                                    const sections = feed.sourceSection?.split(';').map((s: string) => s.trim()).filter(Boolean) || [];
                                    const maxLen = Math.max(files.length, pages.length, sections.length);

                                    if (maxLen <= 1) {
                                      // Single source - simple display
                                      return (
                                        <div className="flex flex-wrap gap-3">
                                          {feed.sourceFile && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                                              <span className="material-symbols-outlined text-[13px] text-blue-500">description</span>
                                              <span className="font-medium">File:</span> {feed.sourceFile}
                                            </div>
                                          )}
                                          {feed.sourcePage && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                                              <span className="material-symbols-outlined text-[13px] text-green-500">article</span>
                                              <span className="font-medium">Page:</span> {feed.sourcePage}
                                            </div>
                                          )}
                                          {feed.sourceSection && (
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                                              <span className="material-symbols-outlined text-[13px] text-purple-500">bookmark</span>
                                              <span className="font-medium">Section:</span> {feed.sourceSection}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // Multiple sources - display as list
                                    return (
                                      <div className="space-y-2">
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[12px]">info</span>
                                          Data compiled from {maxLen} sources:
                                        </p>
                                        <div className="grid gap-2">
                                          {Array.from({ length: maxLen }).map((_, i) => (
                                            <div key={i} className="flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-600">
                                              <span className="text-[10px] font-bold text-slate-400 w-5">#{i + 1}</span>
                                              {files[i] && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400">
                                                  <span className="material-symbols-outlined text-[11px] text-blue-500">description</span>
                                                  {files[i]}
                                                </span>
                                              )}
                                              {pages[i] && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 border-l border-slate-300 dark:border-slate-600 pl-2">
                                                  <span className="material-symbols-outlined text-[11px] text-green-500">article</span>
                                                  {pages[i]}
                                                </span>
                                              )}
                                              {sections[i] && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 border-l border-slate-300 dark:border-slate-600 pl-2">
                                                  <span className="material-symbols-outlined text-[11px] text-purple-500">bookmark</span>
                                                  {sections[i]}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Confidence Score */}
                              {feed.confidenceScore !== undefined && (
                                <div className={`p-2 rounded-lg border flex items-center justify-between ${feed.confidenceScore >= 85 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : feed.confidenceScore >= 70 ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`material-symbols-outlined text-[16px] ${feed.confidenceScore >= 85 ? 'text-green-600' : feed.confidenceScore >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                      {feed.confidenceScore >= 85 ? 'verified' : feed.confidenceScore >= 70 ? 'help' : 'warning'}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">AI Confidence Score</span>
                                  </div>
                                  <div className={`text-sm font-bold ${feed.confidenceScore >= 85 ? 'text-green-600' : feed.confidenceScore >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {feed.confidenceScore}%
                                    <span className="text-[10px] font-normal ml-1">
                                      ({feed.confidenceScore >= 85 ? 'High' : feed.confidenceScore >= 70 ? 'Medium' : 'Low - Review Recommended'})
                                    </span>
                                  </div>
                                </div>
                              )}

                              <p className="text-[10px] text-slate-500 dark:text-slate-500 italic">
                                💡 Use this evidence to verify the AI extraction and for your citations in the final document.
                              </p>
                            </div>
                          </details>
                        )}
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
        fetchedAnswers={chatbotContextWithMetadata}
        onUpdateData={handleChatbotUpdate}
      />
    </div>
  )
}

