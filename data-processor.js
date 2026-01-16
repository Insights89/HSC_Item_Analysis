/**
 * Data Processor Module
 * Handles file reading (SheetJS) and data grouping/sorting.
 */

const DataProcessor = {
    async loadAndParse(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // SMART PARSE: Find the header row
                    // Convert to array of arrays first to find the header
                    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    let headerRowIndex = 0;
                    let foundHeader = false;

                    // Look for a row containing specific known columns
                    // Based on user image: "Subject", "Year", "Question (Item)"
                    const requiredCols = ['Subject', 'Year', 'Question (Item)'];

                    for (let i = 0; i < Math.min(aoa.length, 20); i++) {
                        // CRITICAL FIX: Only check first 12 columns for headers to avoid processing Base64 data
                        // Base64 columns are typically at the end (columns 12-16 in this case)
                        const rowSlice = aoa[i].slice(0, 12);
                        const row = rowSlice.map(c => {
                            // Safely convert to string, skip if too large
                            if (c === null || c === undefined) return '';
                            const str = String(c);
                            if (str.length > 1000) return ''; // Skip large cells during header detection
                            return str.trim();
                        });

                        // Check if this row has the required columns
                        const hasSubject = row.includes('Subject');
                        const hasQuestion = row.some(c => c.includes('Question (Item)'));

                        if (hasSubject && hasQuestion) {
                            headerRowIndex = i;
                            foundHeader = true;
                            console.log(`Found header at row ${i}`);
                            break;
                        }
                    }

                    // Now parse via sheet_to_json using the found range
                    const json = XLSX.utils.sheet_to_json(worksheet, {
                        range: headerRowIndex,
                        defval: "" // Ensure empty cells exist as keys
                    });

                    // Header normalization: Map variants to standard names
                    const normalizedJson = json.map(row => {
                        const newRow = {};
                        for (let key in row) {
                            let normalizedKey = key.trim();
                            // Handle variants for QPC
                            if (normalizedKey.includes('Content Area') || normalizedKey.includes('(QPC)') || normalizedKey === 'QPC') {
                                normalizedKey = 'Question Per Content';
                            }
                            // Handle variants for QPO
                            else if (normalizedKey.includes('Learning Outcome') || normalizedKey.includes('(QPO)') || normalizedKey === 'QPO') {
                                normalizedKey = 'Question Per Outcome';
                            }

                            // Only set if not already set (to avoid overwriting if both exist)
                            if (!newRow[normalizedKey]) {
                                newRow[normalizedKey] = row[key];
                            }
                        }
                        return newRow;
                    });

                    resolve(normalizedJson);
                } catch (err) {
                    console.error("Parse Error:", err);
                    reject(err);
                }
            };

            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    },

    processData(rawData) {
        console.log(`Raw rows read: ${rawData.length}`);

        // 1. Clean Data
        let cleanData = rawData.filter(row => {
            // Trim keys to avoid issues with 'Subject ' vs 'Subject'
            // We'll normalize keys later, but for filtering prompt check:

            // Helper to get value case-insensitively or by exact match
            const getVal = (r, key) => r[key];

            const subject = getVal(row, 'Subject');
            const year = getVal(row, 'Year');
            const q = getVal(row, 'Question (Item)');

            // 1. Check for Header Repeats
            // If the row's 'Question (Item)' starts with 'Question', it's likely a repeated header or metadata
            if (String(q).trim().toLowerCase().startsWith('question')) return false;

            // 2. Check for Essential Data
            // Must have a value for Subject and Year. 
            // 0 is valid for year? Unlikely, but let's check for truthiness or 0
            if (!subject) return false;
            // Year might be parsed as number or string. verify it exists.
            if (!year) return false;

            // 3. Check for Question ID
            // If no question ID, it's useless
            if (!q) return false;

            return true;
        });

        console.log(`Clean data rows: ${cleanData.length}`);

        // Ensure types
        cleanData = cleanData.map(row => {
            return {
                ...row,
                'Subject': String(row['Subject']).trim(),
                'Year': parseInt(row['Year']) || String(row['Year']),
                'Question (Item)': String(row['Question (Item)']),
                'MC/ER': String(row['MC/ER'] || '').trim(),
                'Question Per Content': String(row['Question Per Content'] || '').trim(),
                'Question Per Outcome': String(row['Question Per Outcome'] || '').trim(),
                'School Mean (Item)': parseFloat(row['School Mean (Item)']) || 0,
                'State Mean (Item)': parseFloat(row['State Mean (Item)']) || 0,
                'Max Mark (Item)': parseFloat(row['Max Mark (Item)']) || 0
            };
        });

        // 2. Group by Subject -> Year
        const grouped = {};
        const subjects = new Set();
        const years = new Set();

        cleanData.forEach(row => {
            const sub = row['Subject'];
            const yr = row['Year'];

            subjects.add(sub);
            years.add(yr);

            if (!grouped[sub]) grouped[sub] = {};
            if (!grouped[sub][yr]) grouped[sub][yr] = [];

            grouped[sub][yr].push(row);
        });

        // 3. Helper to get stats
        return {
            raw: cleanData,
            grouped: grouped, // { Subject: { Year: [rows] } }
            stats: {
                totalRows: rawData.length,
                validRows: cleanData.length,
                subjectCount: subjects.size,
                yearCount: years.size,
                subjects: Array.from(subjects).sort(),
                years: Array.from(years).sort()
            }
        };
    },

    generateTemplate() {
        // Use the embedded Base64 data from template-data.js
        if (typeof TEMPLATE_BASE64 === 'undefined') {
            console.error('Template data not loaded');
            alert('Template data is currently unavailable.');
            return;
        }

        try {
            // Clean the Base64 string of any whitespace/newlines that might have leaked in
            const cleanB64 = TEMPLATE_BASE64.replace(/\s/g, '');

            // Convert base64 to blob efficiently
            const byteCharacters = atob(cleanB64);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
            }

            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            // Create a temporary anchor element for download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'template.xlsx'; // Force specific filename as requested
            a.style.display = 'none';

            document.body.appendChild(a);
            a.click();

            // Clean up
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        } catch (err) {
            console.error("Error generating template:", err);
            alert("Error generating template: " + err.message);
        }
    },

    // Python equivalent: sort_questions_naturally
    sortQuestionsNaturally(data, column = 'Question (Item)') {
        return [...data].sort((a, b) => {
            const ka = this.naturalSortKey(a[column]);
            const kb = this.naturalSortKey(b[column]);

            if (ka[0] !== kb[0]) return ka[0] - kb[0]; // Number part
            if (ka[1] < kb[1]) return -1; // String part
            if (ka[1] > kb[1]) return 1;
            return 0;
        });
    },

    naturalSortKey(s) {
        s = String(s).trim();
        const match = s.match(/^(\d+)([a-zA-Z]*)$/);
        if (match) {
            return [parseInt(match[1]), match[2].toLowerCase()];
        }
        return [Infinity, s]; // Non-standard formats go to end
    },

    // ON-DEMAND: Reconstruct Base64 only when needed (saves memory during initial processing)
    reconstructBase64(row) {
        if (!row) return null;

        try {
            // Find all columns starting with HSC_BASE64_ and sort them numerically
            const b64Keys = Object.keys(row)
                .filter(k => /^HSC_BASE64_\d+$/.test(k)) // STRENGTHENED: Only numeric suffixes
                .sort((a, b) => {
                    const numA = parseInt(a.replace('HSC_BASE64_', '')) || 0;
                    const numB = parseInt(b.replace('HSC_BASE64_', '')) || 0;
                    return numA - numB;
                });

            if (b64Keys.length === 0) return null;

            // ULTRA-CONSERVATIVE: Hard limits to prevent any possibility of crash
            const MAX_SAFE_SIZE = 50 * 1024 * 1024; // Reduced to 50MB for safety
            const MAX_CHUNKS = 200; // Reduced chunk limit
            const MAX_CHUNK_SIZE = 500 * 1024; // 500KB per chunk max

            const keysToProcess = b64Keys.slice(0, MAX_CHUNKS);

            // First pass: validate each chunk and calculate total
            let totalLength = 0;
            const validKeys = [];

            for (const k of keysToProcess) {
                const val = row[k];
                if (val) {
                    const chunkLength = String(val).length;

                    // Skip if single chunk is too large
                    if (chunkLength > MAX_CHUNK_SIZE) {
                        console.warn(`Chunk ${k} for question ${row['Question (Item)']} is too large (${(chunkLength / 1024).toFixed(0)}KB). Skipping.`);
                        continue;
                    }

                    // Check if adding this chunk would exceed total
                    if (totalLength + chunkLength > MAX_SAFE_SIZE) {
                        console.error(`Image for question ${row['Question (Item)']} exceeds ${MAX_SAFE_SIZE / 1024 / 1024}MB limit. Truncating.`);
                        break; // Stop processing more chunks
                    }

                    totalLength += chunkLength;
                    validKeys.push(k);
                }
            }

            if (validKeys.length === 0) {
                console.warn(`No valid Base64 chunks found for question ${row['Question (Item)']}`);
                return null;
            }

            // Second pass: build array only with validated chunks
            const b64Parts = [];
            for (const k of validKeys) {
                const val = String(row[k] || '').trim();
                if (val) {
                    b64Parts.push(val);
                }
            }

            if (b64Parts.length === 0) return null;

            // Now safe to join
            let fullB64 = b64Parts.join('');
            if (fullB64 && !fullB64.startsWith('data:image')) {
                fullB64 = 'data:image/png;base64,' + fullB64;
            }

            console.log(`Successfully reconstructed image for question ${row['Question (Item)']} (${(totalLength / 1024).toFixed(0)}KB from ${validKeys.length} chunks)`);
            return fullB64 || null;
        } catch (err) {
            console.error(`Critical error in Base64 reconstruction for question ${row['Question (Item)']}:`, err);
            return null; // Fail gracefully
        }
    }
};
