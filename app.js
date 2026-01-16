/**
 * HSC Analysis App - Main Controller
 * Handles UI interactions, state management, and coordinates modules.
 */

const App = {
    state: {
        currentStep: 1,
        rawData: null,
        processedData: null,
        generatedCharts: [],
        theme: 'dark'
    },

    elements: {
        steps: document.querySelectorAll('.step'),
        sections: {
            upload: document.getElementById('section-upload'),
            review: document.getElementById('section-review'),
            generate: document.getElementById('section-generate'),
            download: document.getElementById('section-download')
        },
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        themeBtn: document.getElementById('theme-btn'),
        btns: {
            backUpload: document.getElementById('btn-back-upload'),
            generate: document.getElementById('btn-generate'),
            startOver: document.getElementById('btn-start-over'),
            download: document.getElementById('btn-download')
        }
    },

    init() {
        this.addEventListeners();
        this.checkTheme();
    },

    addEventListeners() {
        // Theme Toggle
        this.elements.themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            this.state.theme = isLight ? 'light' : 'dark';
            this.elements.themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        });

        // File Upload
        this.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('dragover');
        });

        this.elements.dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('dragover');
        });

        this.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFile(file);
        });

        this.elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFile(file);
        });

        // Template Download
        const btnTemplate = document.getElementById('btn-download-template');
        if (btnTemplate) {
            btnTemplate.addEventListener('click', () => {
                DataProcessor.generateTemplate();
            });
        }

        // Navigation
        this.elements.btns.backUpload.addEventListener('click', () => this.goToStep(1));

        this.elements.btns.generate.addEventListener('click', async () => {
            this.goToStep(3);
            await this.generateReport();
        });

        this.elements.btns.startOver.addEventListener('click', () => {
            location.reload(); // Simple reset
        });

        this.elements.btns.download.addEventListener('click', () => {
            if (window.generatedPdfBlobs && window.generatedPdfBlobs.length > 0) {
                // Download all PDFs
                window.generatedPdfBlobs.forEach(pdfData => {
                    const url = window.URL.createObjectURL(pdfData.blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = pdfData.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                });
            }
        });
    },

    checkTheme() {
        // Default to dark, nothing to do unless we verify system pref or LocalStorage
    },

    goToStep(step) {
        this.state.currentStep = step;

        // Update Step Indicators
        this.elements.steps.forEach((el, idx) => {
            if (idx + 1 === step) el.classList.add('active');
            else if (idx + 1 < step) el.classList.add('active'); // Keep previous steps active? Or checked?
            else el.classList.remove('active');
        });

        // Update Sections
        Object.values(this.elements.sections).forEach(el => el.classList.add('hidden'));

        if (step === 1) {
            this.elements.sections.upload.classList.remove('hidden');
            this.elements.sections.upload.classList.add('active-section');
        } else if (step === 2) {
            this.elements.sections.review.classList.remove('hidden');
            this.elements.sections.review.classList.add('active-section');
        } else if (step === 3) {
            this.elements.sections.generate.classList.remove('hidden');
            this.elements.sections.generate.classList.add('active-section');
        } else if (step === 4) {
            this.elements.sections.download.classList.remove('hidden');
            this.elements.sections.download.classList.add('active-section');

            // Update PDF count display
            if (window.generatedPdfBlobs && window.generatedPdfBlobs.length > 0) {
                const countDisplay = document.getElementById('pdf-count-display');
                if (countDisplay) {
                    countDisplay.innerText = `${window.generatedPdfBlobs.length} PDF file(s) ready`;
                }
            }
        }
    },

    async handleFile(file) {
        if (!file.name.endsWith('.xlsx')) {
            alert('Please upload a valid .xlsx file');
            return;
        }

        try {
            console.log('Processing file:', file.name);
            const data = await DataProcessor.loadAndParse(file);
            this.state.rawData = data;
            this.state.processedData = DataProcessor.processData(data);

            this.updateReviewSection();
            this.goToStep(2);

        } catch (error) {
            console.error(error);
            alert('Error processing file: ' + error.message);
        }
    },

    updateReviewSection() {
        const stats = this.state.processedData.stats;
        let rowCountText = stats.totalRows;
        if (stats.validRows !== stats.totalRows) {
            rowCountText = `${stats.validRows} (of ${stats.totalRows} detected)`;
        }
        document.getElementById('stat-rows').innerText = rowCountText;
        document.getElementById('stat-subjects').innerText = stats.subjectCount;
        document.getElementById('stat-years').innerText = stats.yearCount;

        const tagsContainer = document.getElementById('subject-tags');
        tagsContainer.innerHTML = '';
        stats.subjects.forEach(sub => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerText = sub;
            tagsContainer.appendChild(tag);
        });
    },

    async generateReport() {
        const progressBar = document.getElementById('generation-progress');
        const statusText = document.getElementById('generation-status');

        try {
            // 1. Generate Charts
            statusText.innerText = "Generating Visualizations...";
            progressBar.style.width = "30%";

            // Wait a tick to allow UI to update
            await new Promise(r => setTimeout(r, 100));

            const chartImages = await ChartGenerator.createAllCharts(
                this.state.processedData.grouped,
                (progress) => {
                    // Update progress from chart generator if implemented
                }
            );

            progressBar.style.width = "70%";
            statusText.innerText = "Compiling PDF Reports (per subject)...";
            await new Promise(r => setTimeout(r, 100));

            // 2. Generate PDFs (now returns array of {subject, blob, filename})
            const pdfBlobs = await PdfGenerator.createPDF(chartImages, this.state.processedData);
            window.generatedPdfBlobs = pdfBlobs; // Store array

            progressBar.style.width = "100%";
            statusText.innerText = `Done! Generated ${pdfBlobs.length} PDF(s)`;

            await new Promise(r => setTimeout(r, 500));
            this.goToStep(4);

        } catch (error) {
            console.error(error);
            alert("Error generating report: " + error.message);
            this.goToStep(2); // Go back to review
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
