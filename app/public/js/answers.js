import { fetchExamAnswers, getExamId as getExamIdFromApi } from './components/exam-api.js';

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const pageLoader = document.getElementById('pageLoader');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const retryButton = document.getElementById('retryButton');
    const answersContent = document.getElementById('answersContent');
    const examIdElement = document.getElementById('examId');
    const markdownContent = document.getElementById('markdownContent');
    const backToResultsBtn = document.getElementById('backToResultsBtn');
    
    // Variables
    let currentExamId = null;
    
    // Initialize
    function init() {
        // Get exam ID from URL
        currentExamId = getExamIdFromApi();
        
        if (!currentExamId) {
            showError('No exam ID provided. Please return to the results page.');
            return;
        }
        
        // Update exam ID display
        examIdElement.textContent = `Exam ID: ${currentExamId}`;
        
        // Fetch answers
        fetchAnswers(currentExamId);
        
        // Setup event listeners
        backToResultsBtn.addEventListener('click', goBackToResults);
        retryButton.addEventListener('click', () => fetchAnswers(currentExamId));
    }
    
    // Go back to results page
    function goBackToResults() {
        if (currentExamId) {
            window.location.href = `/results.html?id=${currentExamId}`;
        } else {
            window.location.href = '/';
        }
    }
    
    // Show error message
    function showError(message) {
        pageLoader.style.display = 'none';
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        answersContent.style.display = 'none';
    }
    
    // Fetch answers from API
    function fetchAnswers(examId) {
        // Show loader
        pageLoader.style.display = 'flex';
        errorMessage.style.display = 'none';
        answersContent.style.display = 'none';
        
        // Fetch answers file
        fetchExamAnswers(examId)
            .then(markdownText => {
                // Render markdown
                renderMarkdown(markdownText);
                
                // Hide loader and show content
                pageLoader.style.display = 'none';
                answersContent.style.display = 'block';
            })
            .catch(error => {
                console.error('Error fetching answers:', error);
                showError(`Failed to load answers: ${error.message}`);
            });
    }
    
    // Render markdown content
    function renderMarkdown(markdownText) {
        // Configure marked options
        marked.setOptions({
            highlight: function(code, lang) {
                if (hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                } else {
                    return hljs.highlightAuto(code).value;
                }
            },
            breaks: true,
            gfm: true
        });
        
        // Convert markdown to HTML
        const htmlContent = marked.parse(markdownText);
        
        // Set content
        markdownContent.innerHTML = htmlContent;
        
        // Apply syntax highlighting to code blocks
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    // Start the application
    init();
}); 