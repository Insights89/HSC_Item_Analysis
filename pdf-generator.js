/**
 * PDF Generator Module
 * Uses jsPDF to compile the final report.
 */

const PdfGenerator = {
    async createPDF(chartImages, processedData) {
        // NEW APPROACH: Generate separate PDFs per subject to avoid memory overflow
        const { jsPDF } = window.jspdf;

        // Group all content by subject
        const topBottomPages = this.generateTopBottomMetadata(processedData.grouped);
        const allPages = [
            ...chartImages,
            ...topBottomPages
        ];

        // Group pages by subject
        const pagesBySubject = {};
        allPages.forEach(page => {
            const key = `${page.subject}`;
            if (!pagesBySubject[key]) pagesBySubject[key] = [];
            pagesBySubject[key].push(page);
        });

        // Generate one PDF per subject
        const pdfBlobs = [];
        const subjects = Object.keys(pagesBySubject).sort();

        for (const subject of subjects) {
            console.log(`Generating PDF for ${subject}...`);
            const subjectPages = this.sortPages(pagesBySubject[subject]);
            const blob = await this.createSubjectPDF(subject, subjectPages);
            pdfBlobs.push({
                subject: subject,
                blob: blob,
                filename: `HSC_Analysis_${subject.replace(/[^a-z0-9]/gi, '_')}.pdf`
            });

            // Memory cleanup between PDFs
            await new Promise(r => setTimeout(r, 100));
        }

        return pdfBlobs; // Return array of {subject, blob, filename}
    },

    async createSubjectPDF(subject, pages) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'in',
            format: [11, 8.5]
        });

        // 1. Title Page
        this.addTitlePage(pdf, subject);

        // 2. TOC
        const tocEntries = pages.map((page, idx) => ({
            subject: page.subject,
            year: page.year,
            title: page.title,
            pageNumber: idx + 2
        }));

        this.addTOCPages(pdf, tocEntries);

        // 3. Content Pages
        let pageNum = pdf.getNumberOfPages() + 1;

        for (const pageItem of pages) {
            pdf.addPage();
            this.addFooter(pdf, pageNum, subject);

            if (pageItem.type === 'chart') {
                const imgProps = pdf.getImageProperties(pageItem.image);
                const pdfWidth = 10;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                pdf.addImage(pageItem.image, 'PNG', 0.5, 1, pdfWidth, pdfHeight);
            } else if (pageItem.type === 'topbottom') {
                this.renderTopBottomPage(pdf, pageItem);
            }

            pageNum++;

            // Memory management
            if (pageNum % 2 === 0) {
                await new Promise(r => setTimeout(r, 20));
            }
        }

        return pdf.output('blob');
    },

    addTitlePage(pdf, subject) {
        const width = pdf.internal.pageSize.getWidth();
        pdf.setFontSize(24);
        pdf.setFont("helvetica", "bold");
        pdf.text("HSC Analysis Report - HSC Insight 2026", width / 2, 2.5, { align: "center" });

        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(76, 114, 176);
        pdf.text(subject, width / 2, 3.5, { align: "center" });
        pdf.setTextColor(0, 0, 0);

        pdf.setFontSize(14);
        pdf.setFont("helvetica", "normal");
        const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        pdf.text(`Generated: ${date}`, width / 2, 4.5, { align: "center" });
    },

    addTOCPages(pdf, entries) {
        const entriesPerPage = 20;
        const totalPages = Math.ceil(entries.length / entriesPerPage);

        const tocPageCount = totalPages;
        entries.forEach(e => e.pageNumber += tocPageCount);

        for (let i = 0; i < totalPages; i++) {
            pdf.addPage();
            const width = pdf.internal.pageSize.getWidth();

            pdf.setFontSize(20);
            pdf.setFont("helvetica", "bold");
            const title = i === 0 ? "Table of Contents" : "Table of Contents (continued)";
            pdf.text(title, width / 2, 1, { align: "center" });

            let yPos = 1.5;
            const pageEntries = entries.slice(i * entriesPerPage, (i + 1) * entriesPerPage);

            pageEntries.forEach((entry, idx) => {
                const prevEntry = entries[i * entriesPerPage + idx - 1];
                if (!prevEntry || prevEntry.subject !== entry.subject || prevEntry.year !== entry.year) {
                    pdf.setFontSize(13);
                    pdf.setFont("helvetica", "bold");
                    pdf.setTextColor(76, 114, 176); // #4C72B0
                    pdf.text(`${entry.subject} - ${entry.year}`, 0.5, yPos);
                    yPos += 0.25;
                    pdf.setTextColor(0, 0, 0);
                }

                pdf.setFontSize(10);
                pdf.setFont("helvetica", "normal");
                pdf.text(`• ${entry.title}`, 0.5, yPos);

                pdf.text(String(entry.pageNumber), 10.5, yPos, { align: "right" });

                yPos += 0.25;
            });
        }
    },

    addFooter(pdf, pageNum, subject) {
        const width = pdf.internal.pageSize.getWidth();
        const height = pdf.internal.pageSize.getHeight();
        pdf.setFontSize(9);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`${subject} - Page ${pageNum}`, width - 0.5, height - 0.5, { align: "right" });
        pdf.setTextColor(0, 0, 0);
    },

    generateTopBottomMetadata(groupedData) {
        const pages = [];

        for (const subject of Object.keys(groupedData)) {
            for (const year of Object.keys(groupedData[subject])) {
                const rows = groupedData[subject][year];

                const withRate = rows.map(r => ({
                    ...r,
                    successRate: (r['School Mean (Item)'] / r['Max Mark (Item)']) * 100
                })).sort((a, b) => b['School Mean (Item)'] - a['School Mean (Item)']);

                const top5 = withRate.slice(0, 5);
                const bottom5 = withRate.slice(-5).reverse();

                top5.forEach(row => {
                    pages.push({
                        type: 'topbottom',
                        subject, year,
                        title: `${subject} - ${year} - Best Performing Questions`,
                        data: row,
                        category: 'Top 5',
                        color: 'green'
                    });
                });

                bottom5.forEach((row, idx) => {
                    pages.push({
                        type: 'topbottom',
                        subject, year,
                        title: `${subject} - ${year} - Questions Needing Additional Support`,
                        data: row,
                        category: 'Bottom 5',
                        color: 'red'
                    });
                });
            }
        }
        return pages;
    },

    sortPages(allPages) {
        const groups = {};
        allPages.forEach(p => {
            const k = `${p.subject}|${p.year}`;
            if (!groups[k]) groups[k] = [];
            groups[k].push(p);
        });

        const sortedKeys = Object.keys(groups).sort();

        let result = [];
        sortedKeys.forEach(k => {
            const pages = groups[k];
            const score = (p) => {
                const t = p.title || '';
                if (p.type === 'topbottom') return 35; // Individual question details
                if (p.subType === 'performance-summary') return 25; // Summary of top/bottom
                if (t.includes('Summary')) {
                    if (t.includes('School vs State')) return 60; // Late
                    return 40; // After top/bottom
                }
                if (t.includes('Breakdown')) return 50;
                if (t.includes('School vs State')) return 20; // Bar chart comparison
                return 10; // Basic MC/ER bars
            };

            pages.sort((a, b) => score(a) - score(b));
            result = result.concat(pages);
        });
        return result;
    },

    renderTopBottomPage(pdf, pageItem) {
        const row = pageItem.data;
        const color = pageItem.color === 'green' ? [0, 128, 0] : [255, 0, 0];

        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text(pageItem.title, 5.5, 1, { align: "center" });

        let y = 1.8;
        const x = 1;

        pdf.setFontSize(14);
        pdf.setTextColor(...color);
        pdf.text(`Question: ${row['Question (Item)']}`, x, y);
        y += 0.35;

        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        pdf.text(`MC/ER: ${row['MC/ER']}`, x, y);
        y += 0.35;

        pdf.setFont("helvetica", "bold");
        pdf.text(`School Mean: ${row['School Mean (Item)'].toFixed(2)} / ${row['Max Mark (Item)']}`, x, y);
        y += 0.35;

        pdf.setTextColor(...color);
        pdf.text(`Success Rate: ${row.successRate.toFixed(1)}%`, x, y);
        y += 0.35;

        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        pdf.text(`State Mean: ${row['State Mean (Item)'].toFixed(2)}`, x, y);
        y += 0.45;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text('Content Area (QPC):', x, y);
        y += 0.25;
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(10);
        pdf.text(row['Question Per Content'] || 'N/A', x + 0.2, y);
        y += 0.4;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text('Learning Outcome (QPO):', x, y);
        y += 0.25;
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(10);
        pdf.text(row['Question Per Outcome'] || 'N/A', x + 0.2, y);

        const imageBase64 = DataProcessor.reconstructBase64(row);

        if (imageBase64) {
            try {
                // Add Question Image
                // We'll place it to the right of the text
                const imgProps = pdf.getImageProperties(imageBase64);
                const maxWidth = 5; // inches
                const maxHeight = 4; // inches
                let imgWidth = maxWidth;
                let imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                if (imgHeight > maxHeight) {
                    imgHeight = maxHeight;
                    imgWidth = (imgProps.width * imgHeight) / imgProps.height;
                }

                pdf.addImage(imageBase64, 'PNG', 5.5, 1.8, imgWidth, imgHeight);
            } catch (err) {
                console.error("Error adding question image to PDF:", err);
                pdf.setTextColor(150);
                pdf.setFontSize(9);
                pdf.text("(Error rendering question image)", x, y + 0.5);
            }
        } else {
            pdf.setTextColor(150);
            pdf.setFontSize(9);
            pdf.text("(No question image provided in Excel)", x, y + 0.5);
        }
    }
};
