/**
 * Chart Generator Module
 * Uses Chart.js to create invisible canvases, render charts, then export as images.
 */

const ChartGenerator = {
    // Theme constants from Python script, adapted to JS
    THEME: {
        barColor: "#4C72B0",
        lineColor: "#DD1C77",
        fontFamily: "'Outfit', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
    },

    async createAllCharts(groupedData, statusCallback) {
        const stagingArea = document.getElementById('chart-staging-area');
        stagingArea.innerHTML = ''; // clear previous

        const chartImages = []; // Array of objects { subject, year, title, type, imageDataBase64 }

        // Iterate Subject -> Year
        for (const subject of Object.keys(groupedData)) {
            for (const year of Object.keys(groupedData[subject])) {
                const rows = groupedData[subject][year];

                // 1. MC/ER Visuals
                const mcData = rows.filter(r => r['MC/ER'] === 'MC');
                const erData = rows.filter(r => r['MC/ER'] === 'ER');

                if (mcData.length > 0) await this.generateMixedChart(stagingArea, mcData, subject, year, 'MC', chartImages);
                if (erData.length > 0) await this.generateMixedChart(stagingArea, erData, subject, year, 'ER', chartImages);

                // 2. School vs State Comparison
                if (mcData.length > 0) await this.generateDiffChart(stagingArea, mcData, subject, year, 'MC - School vs State', chartImages);
                if (erData.length > 0) await this.generateDiffChart(stagingArea, erData, subject, year, 'ER - School vs State', chartImages);

                // 3. Top/Bottom Performance
                const withRate = rows.map(r => ({
                    ...r,
                    successRate: (r['School Mean (Item)'] / r['Max Mark (Item)']) * 100
                })).sort((a, b) => b['School Mean (Item)'] - a['School Mean (Item)']);

                const top5 = withRate.slice(0, 5);
                const bottom5 = withRate.slice(-5).reverse();

                if (top5.length > 0) {
                    await this.generatePerformanceSummaryChart(stagingArea, top5, subject, year, 'Best Performing Questions (Top 5)', chartImages);
                }
                if (bottom5.length > 0) {
                    await this.generatePerformanceSummaryChart(stagingArea, bottom5, subject, year, 'Questions Needing Additional Support (Bottom 5)', chartImages);
                }

                // 4. Summaries (QPC / QPO)
                // QPC
                const qpcAgg = this.aggregateData(rows, 'Question Per Content');
                if (qpcAgg.length > 0) await this.generateSummaryChart(stagingArea, qpcAgg, subject, year, 'QPC Summary', 'Question Per Content', chartImages);

                // QPO
                const qpoAgg = this.aggregateData(rows, 'Question Per Outcome');
                if (qpoAgg.length > 0) await this.generateSummaryChart(stagingArea, qpoAgg, subject, year, 'QPO Summary', 'Question Per Outcome', chartImages);

                // QPC/QPO School vs State
                if (qpcAgg.length > 0) await this.generateSummaryDualChart(stagingArea, qpcAgg, subject, year, 'QPC Summary (School vs State)', 'Question Per Content', chartImages);
                if (qpoAgg.length > 0) await this.generateSummaryDualChart(stagingArea, qpoAgg, subject, year, 'QPO Summary (School vs State)', 'Question Per Outcome', chartImages);


                // 5. Per Question Breakdowns (QPC/QPO groups)
                await this.generateGroupBreakdowns(stagingArea, rows, 'Question Per Content', subject, year, chartImages, 'Question (Item)');
                await this.generateGroupBreakdowns(stagingArea, rows, 'Question Per Outcome', subject, year, chartImages, 'Question Per Outcome');
            }
        }

        return chartImages;
    },

    // ---------------- HELPER: Aggregator ---------------- //
    aggregateData(rows, groupCol) {
        const groups = {};
        rows.forEach(row => {
            const key = String(row[groupCol] || '').trim();
            if (!key) return; // Task 4 & 6: Remove blank entries

            if (!groups[key]) {
                groups[key] = {
                    max: 0,
                    schoolSum: 0,
                    stateSum: 0,
                    count: 0,
                    label: key
                };
            }
            groups[key].max += row['Max Mark (Item)'];
            groups[key].schoolSum += row['School Mean (Item)'];
            groups[key].stateSum += row['State Mean (Item)'];
            groups[key].count += 1;
        });

        // Convert to array and calc means
        const result = Object.values(groups).map(g => ({
            [groupCol]: g.label,
            'Max Mark (Item)': g.max,
            'School Mean (Item)': g.schoolSum / g.count,
            'State Mean (Item)': g.stateSum / g.count
        }));

        return DataProcessor.sortQuestionsNaturally(result, groupCol);
    },

    // ---------------- HELPER: Canvas Creator ---------------- //
    createCanvas(width = 1100, height = 600) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        return canvas;
    },

    async chartToImage(chartInstance) {
        return new Promise(resolve => {
            setTimeout(() => {
                const base64 = chartInstance.toBase64Image();
                chartInstance.destroy();
                resolve(base64);
            }, 50);
        });
    },

    // ---------------- CHART TYPE 1: Mixed (Bar + Line) for MC/ER ---------------- //
    async generateMixedChart(container, data, subject, year, titleSuffix, resultsArray, labelCol = 'Question (Item)') {
        const sortedData = DataProcessor.sortQuestionsNaturally(data, labelCol);
        const labels = sortedData.map(d => d[labelCol]);
        const maxMarks = sortedData.map(d => d['Max Mark (Item)']);
        const schoolMeans = sortedData.map(d => d['School Mean (Item)']);
        const successRates = sortedData.map(d => (d['School Mean (Item)'] / d['Max Mark (Item)']) * 100);

        const canvas = this.createCanvas();
        container.appendChild(canvas);

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Success Rate (%)',
                        data: successRates,
                        type: 'line',
                        borderColor: this.THEME.lineColor,
                        backgroundColor: this.THEME.lineColor,
                        borderWidth: 2,
                        pointRadius: 4,
                        yAxisID: 'y1',
                        datalabels: {
                            align: 'top',
                            anchor: 'end',
                            formatter: (val, ctx) => {
                                const actual = schoolMeans[ctx.dataIndex];
                                return `${val.toFixed(0)}% (${actual.toFixed(2)})`;
                            },
                            font: { size: 10, weight: 'bold' },
                            color: this.THEME.lineColor
                        }
                    },
                    {
                        label: 'Maximum Mark',
                        data: maxMarks,
                        backgroundColor: this.THEME.barColor,
                        yAxisID: 'y',
                        datalabels: {
                            anchor: 'end',
                            align: 'end',
                            offset: -5,
                            formatter: Math.round,
                            color: '#000', // Task 1: Changed from #fff to black
                            font: { size: 10 }
                        }
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: 20 },
                plugins: {
                    title: {
                        display: true,
                        text: `${subject} - ${year} - ${titleSuffix}`,
                        font: { size: 18, family: 'Outfit' }
                    },
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Max Mark', color: this.THEME.barColor, font: { weight: 'bold' } },
                        grid: { display: false }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 100,
                        grid: { display: false },
                        title: { display: true, text: 'Success Rate (%)', color: this.THEME.lineColor, font: { weight: 'bold' } }
                    },
                    x: {
                        title: { display: true, text: labelCol },
                        grid: { display: false }
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const chart = new Chart(canvas, config);
        const img = await this.chartToImage(chart);
        canvas.remove();

        resultsArray.push({
            subject, year,
            title: `${subject} - ${year} - ${titleSuffix}`,
            type: 'chart',
            image: img
        });
    },

    // ---------------- CHART TYPE 2: Diff Chart (School vs State) ---------------- //
    async generateDiffChart(container, data, subject, year, titleSuffix, resultsArray) {
        const sortedData = DataProcessor.sortQuestionsNaturally(data);
        const labels = sortedData.map(d => d['Question (Item)']);
        // Diff = School - State
        const diffs = sortedData.map(d => d['School Mean (Item)'] - d['State Mean (Item)']);

        const colors = diffs.map(v => v >= 0 ? 'rgba(75, 192, 192, 0.7)' : 'rgba(255, 99, 132, 0.7)');

        const canvas = this.createCanvas();
        container.appendChild(canvas);

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Difference',
                    data: diffs,
                    backgroundColor: colors,
                    datalabels: {
                        anchor: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'start',
                        align: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 0 ? 'top' : 'bottom',
                        formatter: (val) => val.toFixed(2),
                        font: { weight: 'bold', size: 9 },
                        color: '#000' // Better visibility
                    }
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: 20 },
                plugins: {
                    title: {
                        display: true,
                        text: `${subject} - ${year} - ${titleSuffix}`,
                        font: { size: 18 }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Difference (School - State Mean)' },
                        grid: { display: false }
                    },
                    x: {
                        title: { display: true, text: 'Question Number' },
                        grid: { display: false }
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const chart = new Chart(canvas, config);
        const img = await this.chartToImage(chart);
        canvas.remove();

        resultsArray.push({
            subject, year,
            title: `${subject} - ${year} - ${titleSuffix}`,
            type: 'chart',
            image: img
        });
    },

    // ---------------- CHART TYPE 3: Summary Chart (Groups) ---------------- //
    async generateSummaryChart(container, aggData, subject, year, titleSuffix, xLabel, resultsArray) {
        const labels = aggData.map(d => d[xLabel]);
        const maxMarks = aggData.map(d => d['Max Mark (Item)']);
        const successRates = aggData.map(d => (d['School Mean (Item)'] / d['Max Mark (Item)']) * 100);
        const schoolMeans = aggData.map(d => d['School Mean (Item)']);

        const canvas = this.createCanvas();
        container.appendChild(canvas);

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Success Rate (%)',
                        data: successRates,
                        type: 'line',
                        borderColor: this.THEME.lineColor,
                        backgroundColor: this.THEME.lineColor,
                        yAxisID: 'y1',
                        datalabels: {
                            align: 'top',
                            anchor: 'end',
                            formatter: (val, ctx) => `${val.toFixed(0)}% (${schoolMeans[ctx.dataIndex].toFixed(2)})`,
                            font: { size: 10, weight: 'bold' },
                            color: this.THEME.lineColor
                        }
                    },
                    {
                        label: 'Maximum Mark',
                        data: maxMarks,
                        backgroundColor: this.THEME.barColor,
                        yAxisID: 'y',
                        datalabels: {
                            display: true,
                            anchor: 'end',
                            align: 'top',
                            color: '#000',
                            font: { size: 10, weight: 'bold' },
                            formatter: Math.round
                        }
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: 20 },
                plugins: {
                    title: {
                        display: true,
                        text: `${subject} - ${year} - ${titleSuffix}`,
                        font: { size: 18 }
                    },
                },
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Max Mark', color: this.THEME.barColor },
                        grid: { display: false }
                    },
                    y1: {
                        position: 'right',
                        min: 0, max: 100,
                        title: { display: true, text: 'Success Rate (%)', color: this.THEME.lineColor },
                        grid: { display: false }
                    },
                    x: {
                        title: { display: true, text: xLabel },
                        ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 },
                        grid: { display: false }
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const chart = new Chart(canvas, config);
        const img = await this.chartToImage(chart);
        canvas.remove();

        resultsArray.push({
            subject, year,
            title: `${subject} - ${year} - ${titleSuffix}`,
            type: 'chart',
            image: img
        });
    },

    // ---------------- CHART TYPE 4: Summary Dual (School vs State) ---------------- //
    async generateSummaryDualChart(container, aggData, subject, year, titleSuffix, xLabel, resultsArray) {
        const labels = aggData.map(d => d[xLabel]);
        const maxMarks = aggData.map(d => d['Max Mark (Item)']);
        const schoolRates = aggData.map(d => (d['School Mean (Item)'] / d['Max Mark (Item)']) * 100);
        const stateRates = aggData.map(d => (d['State Mean (Item)'] / d['Max Mark (Item)']) * 100);

        const canvas = this.createCanvas();
        container.appendChild(canvas);

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'School Rate (%)',
                        data: schoolRates,
                        type: 'line',
                        borderColor: this.THEME.lineColor,
                        backgroundColor: this.THEME.lineColor,
                        yAxisID: 'y1',
                        datalabels: {
                            align: 'top',
                            anchor: 'end',
                            formatter: (val) => `${val.toFixed(0)}%`,
                            font: { size: 10, weight: 'bold' },
                            color: this.THEME.lineColor
                        }
                    },
                    {
                        label: 'State Rate (%)',
                        data: stateRates,
                        type: 'line',
                        borderColor: 'orange',
                        backgroundColor: 'orange',
                        borderDash: [5, 5],
                        yAxisID: 'y1',
                        datalabels: { display: false }
                    },
                    {
                        label: 'Maximum Mark',
                        data: maxMarks,
                        backgroundColor: this.THEME.barColor,
                        yAxisID: 'y',
                        datalabels: { display: false }
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: 20 },
                plugins: {
                    title: {
                        display: true,
                        text: `${subject} - ${year} - ${titleSuffix}`,
                        font: { size: 18 }
                    },
                },
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Max Mark', color: this.THEME.barColor },
                        grid: { display: false }
                    },
                    y1: {
                        position: 'right',
                        min: 0, max: 100,
                        title: { display: true, text: 'Success Rate (%)' },
                        grid: { display: false }
                    },
                    x: {
                        title: { display: true, text: xLabel },
                        ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 },
                        grid: { display: false }
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const chart = new Chart(canvas, config);
        const img = await this.chartToImage(chart);
        canvas.remove();

        resultsArray.push({
            subject, year,
            title: `${subject} - ${year} - ${titleSuffix}`,
            type: 'chart',
            image: img
        });
    },

    // ---------------- CHART TYPE 5: Group Breakdowns ---------------- //
    async generateGroupBreakdowns(container, rows, groupCol, subject, year, resultsArray, labelCol = 'Question (Item)') {
        const groups = {};
        rows.forEach(r => {
            const key = String(r[groupCol] || '').trim();
            if (!key) return; // Task 4 & 6: Remove blank entries
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });

        for (const groupName of Object.keys(groups)) {
            const groupData = groups[groupName];
            const prefix = groupCol === 'Question Per Content' ? 'QPC Breakdown' : 'QPO Breakdown';
            const titleSuffix = `${prefix}: ${groupName}`;

            await this.generateMixedChart(container, groupData, subject, year, titleSuffix, resultsArray, labelCol);
        }
    },

    // ---------------- CHART TYPE 6: Performance Summary (Top/Bottom 5) ---------------- //
    async generatePerformanceSummaryChart(container, data, subject, year, titleSuffix, resultsArray) {
        const labels = data.map(d => d['Question (Item)']);
        const schoolMeans = data.map(d => d['School Mean (Item)']);
        const stateMeans = data.map(d => d['State Mean (Item)']);
        const maxMarks = data.map(d => d['Max Mark (Item)']);

        const canvas = this.createCanvas();
        container.appendChild(canvas);

        const config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'School Mean',
                        data: schoolMeans,
                        backgroundColor: this.THEME.barColor,
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            formatter: (val) => val.toFixed(2),
                            font: { size: 10, weight: 'bold' },
                            color: '#000'
                        }
                    },
                    {
                        label: 'State Mean',
                        data: stateMeans,
                        backgroundColor: 'orange',
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            formatter: (val) => val.toFixed(2),
                            font: { size: 10 },
                            color: '#000'
                        }
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: 30 },
                plugins: {
                    title: {
                        display: true,
                        text: `${subject} - ${year} - ${titleSuffix}`,
                        font: { size: 18 }
                    },
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Mean Mark' },
                        grid: { display: false }
                    },
                    x: {
                        title: { display: true, text: 'Question Number' },
                        grid: { display: false }
                    }
                }
            },
            plugins: [ChartDataLabels]
        };

        const chart = new Chart(canvas, config);
        const img = await this.chartToImage(chart);
        canvas.remove();

        resultsArray.push({
            subject, year,
            title: `${subject} - ${year} - ${titleSuffix}`,
            type: 'chart',
            image: img,
            subType: 'performance-summary'
        });
    }
};
