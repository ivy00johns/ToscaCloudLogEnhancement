// ==UserScript==
// @name         Tosca Cloud Log Enhancer
// @namespace    http://tricentis.com/
// @version      1.1
// @description  Enhance readability of Tosca Cloud logs
// @match        https://*.tricentis.com/_portal/space/*/runs/*
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	console.log('Tosca Log Enhancer v1.2 loaded.');

	let isProcessing = false;
	let lastContent = '';
	let updateTimeout = null;

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
        }

        .log-line {
            display: block;
            padding: 1px 8px 1px 0px;
            margin: 0;
            border-radius: 3px;
            border-left: 3px solid transparent;
            box-sizing: border-box;
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

	function enhanceLogs() {
		if (isProcessing) return;

		isProcessing = true;

		try {
			const logContainer = findLogContainer();

			if (!logContainer) {
				console.log('Tosca Log Enhancer: Log container not found');
				return;
			}

			const currentContent = logContainer.innerText;

			// Check if container was replaced or content changed
			let enhancedContainer = logContainer.querySelector('.tosca-log-container');
			const containerExists = !!enhancedContainer;

			// If container exists but content is different, or container doesn't exist
			if (currentContent !== lastContent || !containerExists) {
				lastContent = currentContent;

				// Add styles to document (only once)
				if (!document.getElementById('tosca-log-styles')) {
					const styleElement = document.createElement('style');
					styleElement.id = 'tosca-log-styles';
					styleElement.textContent = styles;
					document.head.appendChild(styleElement);
				}

				const logLines = currentContent.split('\n').filter(line => line.trim());

				const processedLines = logLines.map(line => {
					const trimmedLine = line.trim();
					if (!trimmedLine) return '';

					const cssClass = classifyLogLine(trimmedLine);
					const escapedLine = escapeHtml(trimmedLine);

					return `<div class="log-line ${cssClass}">${escapedLine}</div>`;
				});

				// Always recreate the container to handle page updates
				if (!enhancedContainer || !containerExists) {
					enhancedContainer = document.createElement('div');
					enhancedContainer.className = 'tosca-log-container';
				}

				enhancedContainer.innerHTML = processedLines.join('');

				// Replace the entire content of logContainer
				logContainer.innerHTML = '';
				logContainer.appendChild(enhancedContainer);

				console.log(`Tosca Log Enhancer: Enhanced ${processedLines.length} log lines (container recreated: ${!containerExists})`);
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

	const debouncedEnhance = debounce(enhanceLogs, 300);

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
			const hasRelevantChanges = mutations.some(mutation => {
				if (mutation.type === 'childList') {
					// Check for any text content changes or new nodes
					const hasTextChanges = Array.from(mutation.addedNodes).some(node => {
						return node.nodeType === Node.TEXT_NODE ||
							(node.nodeType === Node.ELEMENT_NODE && node.textContent);
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
			if (!isProcessing) {
				const logContainer = findLogContainer();
				if (logContainer && !logContainer.querySelector('.tosca-log-container')) {
					console.log('Tosca Log Enhancer: Periodic check detected missing container');
					enhanceLogs();
				}
			}
		}, 6000); // Check every 6 seconds (slightly longer than page update interval)

		console.log('Tosca Log Enhancer: MutationObserver initialized');
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initLogEnhancer);
	} else {
		initLogEnhancer();
	}

})();
