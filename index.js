// ==UserScript==
// @name         Tosca Cloud Log Enhancer
// @namespace    http://tricentis.com/
// @version      1.3
// @description  Enhance readability of Tosca Cloud logs
// @match        https://*.tricentis.com/_portal/space/*/runs/*
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	console.log('Tosca Log Enhancer v1.3 loaded.');

	let isProcessing = false;
	let processedLines = new Set();
	let enhancedContainer = null;
	let updateTimeout = null;
	let stylesInjected = false;
	let lastUpdateTime = 0;
	let lastContentHash = '';

	const styles = `
        .tosca-log-container {
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
            min-width: 1700px;
            max-width: 2000px;
            margin: 0 auto;
            background-color: #f8f9fa;
            border-radius: 5px;
            padding: 0;
            border: none;
            box-sizing: border-box;
            contain: layout style;
            will-change: contents;
        }

        .log-line {
            display: block;
            padding: 1px 8px 1px 0px;
            margin: 0;
            border-radius: 3px;
            border-left: 3px solid transparent;
            box-sizing: border-box;
            transform: translateZ(0);
        }

        .log-line.succeeded {
            background-color: rgba(40, 167, 69, 0.1);
            border-left-color: #28a745;
        }

        .log-line.failed {
            background-color: rgba(220, 53, 69, 0.1);
            border-left-color: #dc3545;
        }

        .log-line.info {
            background-color: rgba(23, 162, 184, 0.1);
            border-left-color: #17a2b8;
        }

        .log-line.warning {
            background-color: rgba(255, 193, 7, 0.1);
            border-left-color: #ffc107;
        }

        .log-line.error {
            background-color: rgba(220, 53, 69, 0.15);
            border-left-color: #dc3545;
            font-weight: bold;
        }

        .log-timestamp {
            color: #6c757d;
            font-weight: normal;
        }

        .log-level {
            font-weight: bold;
            margin-right: 5px;
        }

        /* Reset any inherited styles that might cause jumps */
        .tosca-log-container * {
            box-sizing: border-box;
        }
    `;

	function findLogContainer() {
		const selectors = [
			'.MuiBox-root.css-0',
			'[class*="MuiBox"][class*="css-"]',
			'[data-testid*="log"]',
			'.log-container'
		];

		for (const selector of selectors) {
			const elements = document.querySelectorAll(selector);
			for (const element of elements) {
				if (element.textContent && element.textContent.includes('[INF][TBox]')) {
					return element;
				}
			}
		}

		return null;
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function classifyLogLine(line) {
		const upperLine = line.toUpperCase();

		if (upperLine.includes('[SUCCEEDED]') || upperLine.includes('SUCCESS')) {
			return 'succeeded';
		} else if (upperLine.includes('[FAILED]') || upperLine.includes('FAILURE')) {
			// Check if this is a setup/cleanup/evaluation step that should be yellow instead of red
			const setupCleanupPatterns = [
				'IS THE BROWSER OPEN?',
				'OPERATION"',  // Generic operation checks
				'CLEANUP',
				'SETUP',
				'EVALUATION',
				'CHECK IF',
				'VERIFY IF',
				'WINDOWS FOUND',
				'TBOX EVALUATION TOOL',  // TBox evaluation expressions
				'EXPRESSION"',           // Generic expression evaluations
				'EVALUATED TO'           // When showing evaluation results
			];

			const isSetupCleanup = setupCleanupPatterns.some(pattern =>
				upperLine.includes(pattern)
			);

			if (isSetupCleanup) {
				return 'warning';  // Yellow for setup/cleanup failures
			}

			return 'failed';  // Red for actual test failures
		} else if (upperLine.includes('[ERR]') || upperLine.includes('ERROR')) {
			return 'error';
		} else if (upperLine.includes('[WRN]') || upperLine.includes('WARNING')) {
			return 'warning';
		} else if (upperLine.includes('[INF]') || upperLine.includes('INFO')) {
			return 'info';
		}

		return 'info';
	}

	function injectStyles() {
		if (!stylesInjected && !document.getElementById('tosca-log-styles')) {
			const styleElement = document.createElement('style');
			styleElement.id = 'tosca-log-styles';
			styleElement.textContent = styles;
			document.head.appendChild(styleElement);
			stylesInjected = true;
		}
	}

	function createLogLineElement(line, lineNumber) {
		const trimmedLine = line.trim();
		if (!trimmedLine) return null;

		const cssClass = classifyLogLine(trimmedLine);
		const escapedLine = escapeHtml(trimmedLine);

		const logLineDiv = document.createElement('div');
		logLineDiv.className = `log-line ${cssClass}`;
		logLineDiv.innerHTML = escapedLine;
		logLineDiv.dataset.lineNumber = lineNumber;

		return logLineDiv;
	}

	function enhanceLogs() {
		if (isProcessing) return;

		isProcessing = true;

		try {
			const logContainer = findLogContainer();

			if (!logContainer) {
				console.log('Tosca Log Enhancer: Log container not found');
				return;
			}

			injectStyles();

			const currentContent = logContainer.innerText;
			const currentLines = currentContent.split('\n').filter(line => line.trim());
			
			// Create a simple hash of the content to detect actual changes
			const contentHash = currentContent.length + ':' + (currentLines.length > 0 ? currentLines[currentLines.length - 1] : '');
			const now = Date.now();
			
			// Skip if content hasn't changed and we recently processed
			if (contentHash === lastContentHash && (now - lastUpdateTime) < 500) {
				return;
			}
			
			lastContentHash = contentHash;
			lastUpdateTime = now;

			// Create or find our enhanced container
			if (!enhancedContainer || !logContainer.contains(enhancedContainer)) {
				enhancedContainer = document.createElement('div');
				enhancedContainer.className = 'tosca-log-container';

				// Store scroll position if container exists
				const scrollTop = logContainer.scrollTop;

				// Replace container content
				logContainer.innerHTML = '';
				logContainer.appendChild(enhancedContainer);

				// Restore scroll position
				logContainer.scrollTop = scrollTop;

				// Reset tracking
				processedLines.clear();
			}

			// Get current number of processed lines
			const currentProcessedCount = enhancedContainer.children.length;

			// If we have fewer lines than displayed, container was reset
			if (currentLines.length < currentProcessedCount) {
				enhancedContainer.innerHTML = '';
				processedLines.clear();
			}

			// Process new lines (from currentProcessedCount onwards)
			if (currentLines.length > currentProcessedCount) {
				const fragment = document.createDocumentFragment();
				let newLinesCount = 0;

				for (let i = currentProcessedCount; i < currentLines.length; i++) {
					const line = currentLines[i];
					const lineKey = `${i}:${line.trim()}`;

					if (!processedLines.has(lineKey)) {
						const logLineElement = createLogLineElement(line, i);
						if (logLineElement) {
							fragment.appendChild(logLineElement);
							newLinesCount++;
						}
						processedLines.add(lineKey);
					}
				}

				if (newLinesCount > 0) {
					enhancedContainer.appendChild(fragment);
					console.log(`Tosca Log Enhancer: Added ${newLinesCount} new lines (total: ${currentLines.length})`);
				}
			} else if (currentLines.length < processedLines.size) {
				// Full reset needed
				enhancedContainer.innerHTML = '';
				processedLines.clear();

				const fragment = document.createDocumentFragment();
				currentLines.forEach((line, index) => {
					const lineKey = `${index}:${line.trim()}`;
					processedLines.add(lineKey);
					const logLineElement = createLogLineElement(line, index);
					if (logLineElement) {
						fragment.appendChild(logLineElement);
					}
				});

				enhancedContainer.appendChild(fragment);
				console.log(`Tosca Log Enhancer: Full reset, processed ${currentLines.length} lines`);
			}

		} catch (error) {
			console.error('Tosca Log Enhancer: Error in enhanceLogs:', error);
		} finally {
			isProcessing = false;
		}
	}

	function debounce(func, wait) {
		return function executedFunction(...args) {
			if (updateTimeout) {
				clearTimeout(updateTimeout);
			}
			updateTimeout = setTimeout(() => {
				func.apply(this, args);
				updateTimeout = null;
			}, wait);
		};
	}

	const debouncedEnhance = debounce(enhanceLogs, 250);

	function initLogEnhancer() {
		console.log('Tosca Log Enhancer: Initializing...');

		// Initial enhancement with retry mechanism
		let retryCount = 0;
		const maxRetries = 5;

		function tryEnhance() {
			const logContainer = findLogContainer();
			if (logContainer || retryCount >= maxRetries) {
				enhanceLogs();
				console.log('Tosca Log Enhancer: Initial enhancement completed');
			} else {
				retryCount++;
				console.log(`Tosca Log Enhancer: Retry ${retryCount}/${maxRetries} in 1 second...`);
				setTimeout(tryEnhance, 1000);
			}
		}

		setTimeout(tryEnhance, 1000);

		// Set up MutationObserver
		const observer = new MutationObserver((mutations) => {
			// Only process if we haven't updated recently
			const now = Date.now();
			if (now - lastUpdateTime < 200) return;
			
			const hasRelevantChanges = mutations.some(mutation => {
				if (mutation.type === 'childList') {
					// Check for any text content changes or new nodes, but exclude our own changes
					const hasTextChanges = Array.from(mutation.addedNodes).some(node => {
						return node.nodeType === Node.TEXT_NODE ||
							(node.nodeType === Node.ELEMENT_NODE && 
							 node.textContent && 
							 !node.classList?.contains('tosca-log-container') &&
							 !node.classList?.contains('log-line'));
					});

					// Also check if our enhanced container was removed
					const containerRemoved = Array.from(mutation.removedNodes).some(node => {
						return node.nodeType === Node.ELEMENT_NODE &&
							(node.classList?.contains('tosca-log-container') ||
								node.querySelector?.('.tosca-log-container'));
					});

					return hasTextChanges || containerRemoved;
				}
				return false;
			});

			if (hasRelevantChanges && !isProcessing) {
				console.log('Tosca Log Enhancer: DOM changes detected, triggering update');
				debouncedEnhance();
			}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true  // Also watch for text changes
		});

		// Additional periodic check to handle any missed updates
		setInterval(() => {
			if (!isProcessing && (Date.now() - lastUpdateTime) > 2000) {
				const logContainer = findLogContainer();
				if (logContainer) {
					const containerMissing = !logContainer.querySelector('.tosca-log-container');
					const currentContent = logContainer.innerText;
					const contentHash = currentContent.length + ':' + (currentContent.split('\n').filter(line => line.trim()).slice(-1)[0] || '');
					const contentChanged = contentHash !== lastContentHash;

					if (containerMissing || contentChanged) {
						console.log('Tosca Log Enhancer: Periodic check detected changes');
						enhanceLogs();
					}
				}
			}
		}, 5000); // Check every 5 seconds, but only if no recent updates

		console.log('Tosca Log Enhancer: MutationObserver initialized');
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initLogEnhancer);
	} else {
		initLogEnhancer();
	}

})();
