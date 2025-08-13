// --- CONFIG: Set these for your repo/API endpoints ---
const GITHUB_CONFIGS_API = "https://api.github.com/repos/bnzly/neat.sheet/contents/league_configs/league_configs.json";
const GITHUB_SHEETS_API = "https://api.github.com/repos/bnzly/neat.sheet/contents/generated_sheets/";
const AWS_LAMBDA_API = "https://63foxil595.execute-api.us-east-2.amazonaws.com/Prod/neatsheet-league-config-handler";

// Debouncing variables
let checkConfigTimeout = null;
let artificialDelayTimeout = null;
let configCheckVersion = null;
let lastApiCall = 0;
let awsPendingInterval = null;
let githubPendingInterval = null;
const MIN_API_INTERVAL = 1000; // Minimum 1 second between API calls
const DEBOUNCE_DELAY = 1750; // Wait 1.75 seconds after user stops typing

// === INITIALIZATION ===
// Get current date in Eastern Time (EST/EDT)
const date = new Date();
const estDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
const formattedDate = `${estDate.getFullYear()}-${String(estDate.getMonth() + 1).padStart(2, '0')}-${String(estDate.getDate()).padStart(2, '0')}`;

// === CUSTOM NUMBER INPUT FUNCTIONS ===
/**
 * Increment or decrement a number input field by its step value.
 * @param {string} inputId - The ID of the input element to modify.
 */
function incrementInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const step = parseFloat(input.step) || 1;
    const max = input.max !== "" ? parseFloat(input.max) : Infinity;
    let currentValue = parseFloat(input.value) || 0;
    
    const newValue = currentValue + step;
    if (newValue <= max) {
        input.value = newValue;
        input.dispatchEvent(new Event('input'));
    }
}

function decrementInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const step = parseFloat(input.step) || 1;
    const min = input.min !== "" ? parseFloat(input.min) : -Infinity;
    let currentValue = parseFloat(input.value) || 0;
    
    const newValue = currentValue - step;
    if (newValue >= min) {
        input.value = newValue;
        input.dispatchEvent(new Event('input'));
    }
}

// === AUCTION TOGGLE FUNCTIONALITY ===
function toggleAuctionFields() {
    const auctionFields = document.getElementById('auction-fields');
    const auctionBudgetInput = document.getElementById('auction-budget');
    if (!auctionFields || !auctionBudgetInput) return;
    const auctionBudgetButtons = auctionBudgetInput.parentElement.querySelectorAll('.number-input-btn');
    const auctionBudgetLabel = auctionBudgetInput.closest('.input-container').querySelector('label');

    // Handle roster priorities radio buttons
    const rosterPriorityInputs = document.querySelectorAll('input[name="roster-priorities"]');
    const rosterPriorityContainer = document.querySelector('input[name="roster-priorities"]')?.closest('.radio-container');
    const rosterPriorityLabels = document.querySelectorAll('input[name="roster-priorities"] + label');
    const rosterPrioritiesMainLabel = document.querySelector('label[for="roster-priorities"]');

    // Tooltip elements
    const rosterPrefTooltip = document.querySelector('.roster-pref-tooltip');

    if (document.getElementById('radio-auction')?.checked) {
        // Enable auction fields
        auctionBudgetInput.disabled = false;
        auctionBudgetButtons.forEach(btn => btn.disabled = false);
        auctionBudgetInput.parentElement.classList.remove('disabled');
        auctionBudgetLabel?.classList.remove('disabled-label');

        // Enable roster priorities
        rosterPriorityInputs.forEach(input => input.disabled = false);
        rosterPriorityContainer?.classList.remove('disabled');
        rosterPriorityLabels.forEach(label => label.classList.remove('disabled-label'));
        rosterPrioritiesMainLabel?.classList.remove('disabled-label');

        // Enable tooltip
        rosterPrefTooltip?.classList.remove('disabled');
    } else {
        // Disable auction fields
        auctionBudgetInput.disabled = true;
        auctionBudgetButtons.forEach(btn => btn.disabled = true);
        auctionBudgetInput.parentElement.classList.add('disabled');
        auctionBudgetLabel?.classList.add('disabled-label');

        // Disable roster priorities
        rosterPriorityInputs.forEach(input => input.disabled = true);
        rosterPriorityContainer?.classList.add('disabled');
        rosterPriorityLabels.forEach(label => label.classList.add('disabled-label'));
        rosterPrioritiesMainLabel?.classList.add('disabled-label');

        // Disable tooltip
        rosterPrefTooltip?.classList.add('disabled');
    }
}

// === LEAGUE CONFIGURATION ID GENERATOR ===

function generateLeagueConfigId(leagueSettings, scoringSettings, rosterSettings = null) {
    /**
     * Generate a 5-character hash ID based on league and scoring settings.
     * For backwards compatibility, combines legacy league settings (# of Teams, # of weeks)
     * with roster settings, excluding new draft_type and auction fields for snake drafts.
     * For auction drafts, includes all league settings including auction fields.
     */
    
    let leagueSettingsToUse;
    
    if (leagueSettings["draft_type"] === "auction") {
        leagueSettingsToUse = {
            "# of Teams": leagueSettings["# of Teams"],
            "# of weeks": leagueSettings["# of weeks"],
            "auction_budget": leagueSettings["auction_budget"],
            "auction_minimum_bid": leagueSettings["auction_minimum_bid"],
            "auction_target_ratio": leagueSettings["auction_target_ratio"],
        };
    } else {
        // For snake drafts, use backwards compatible league settings (exclude new fields)
        leagueSettingsToUse = {
            "# of Teams": leagueSettings["# of Teams"],
            "# of weeks": leagueSettings["# of weeks"]
        };
    }
    
    // If roster settings are provided separately, use them; otherwise extract from league settings. This is again for backwards compatibility.
    const rosterSettingsToUse = rosterSettings || {
        "QB": leagueSettings["QB"],
        "RB": leagueSettings["RB"], 
        "WR": leagueSettings["WR"],
        "TE": leagueSettings["TE"],
        "WR/RB": leagueSettings["WR/RB"],
        "WR/TE": leagueSettings["WR/TE"],
        "WR/RB/TE": leagueSettings["WR/RB/TE"],
        "QB/WR/RB/TE": leagueSettings["QB/WR/RB/TE"],
        "Bench": leagueSettings["Bench"],
        "K": leagueSettings["K"],
        "DST": leagueSettings["DST"]
    };
    
    const combinedSettings = {
        ...leagueSettingsToUse,
        ...rosterSettingsToUse,
        ...scoringSettings
    };
    
    // Sort keys to ensure consistent ordering
    const sortedSettings = {};
    Object.keys(combinedSettings).sort().forEach(key => {
        sortedSettings[key] = combinedSettings[key];
    });
    

    const settingsString = JSON.stringify(sortedSettings);
    
    // Create MD5 hash (using crypto-js library)
    const hash = CryptoJS.MD5(settingsString).toString();
    
    // Take first 5 characters and convert to uppercase
    const configId = hash.substring(0, 5).toUpperCase();
    
    return configId;
}

function updateConfigWithGeneratedIds(config) {
    /**
     * Update a single configuration with generated ID and readable name.
     */
    const configId = generateLeagueConfigId(config.league_settings, config.scoring_settings, config.roster_settings);
    const readableName = `${configId}_${config.league_settings["draft_type"]}`;

    return {
        ...config,
        league_config_id: configId,
        readable_name: readableName
    };
}

function getFormConfigData() {
    /**
     * Extract configuration data from the HTML form - updated for new structure
     */
    // Get draft type from radio buttons
    const draftTypeElement = document.querySelector('input[name="draft-type"]:checked');
    const draftType = draftTypeElement ? (draftTypeElement.id === 'radio-auction' ? 'auction' : 'snake') : 'snake';
    
    // Get roster priorities from radio buttons
    const rosterPriorityElement = document.querySelector('input[name="roster-priorities"]:checked');
    const rosterPriorityText = rosterPriorityElement ? rosterPriorityElement.id.replace('radio-', '') : 'balanced';

    // Map roster priority text to numeric values
    let rosterPriority;
    switch (rosterPriorityText) {
        case 'bench':
            rosterPriority = 1.0;
            break;
        case 'balanced':
            rosterPriority = 3.0;
            break;
        case 'starters':
            rosterPriority = 5.0;
            break;
        default:
            rosterPriority = 3.0; // default to balanced
    }
    
    const leagueSettings = {
        "# of Teams": parseInt(document.getElementById('teams')?.value || '10'),
        "# of weeks": 17, // Fixed value since weeks input is not in new HTML
        "draft_type": draftType,
        "auction_budget": parseInt(document.getElementById('auction-budget')?.value || '0'),
        "auction_minimum_bid": 1,
        "auction_target_ratio": rosterPriority
    };

    const rosterSettings = {
        "QB": parseInt(document.getElementById('qb')?.value || '1'),
        "RB": parseInt(document.getElementById('rb')?.value || '2'),
        "WR": parseInt(document.getElementById('wr')?.value || '2'),
        "TE": parseInt(document.getElementById('te')?.value || '1'),
        "WR/RB": parseInt(document.getElementById('wrrb')?.value || '0'),
        "WR/TE": parseInt(document.getElementById('wrte')?.value || '0'),
        "WR/RB/TE": parseInt(document.getElementById('wrrbte')?.value || '1'),
        "QB/WR/RB/TE": parseInt(document.getElementById('qbwrrbte')?.value || '0'),
        "Bench": parseInt(document.getElementById('bench')?.value || '6'),
        "K": parseInt(document.getElementById('k')?.value || '1'),
        "DST": parseInt(document.getElementById('dst')?.value || '1')
    };
    
    const scoringSettings = {
        "Pass yds": parseFloat(document.getElementById('passyds')?.value || '0.04'),
        "Rush yds": parseFloat(document.getElementById('rushyds')?.value || '0.1'),
        "Rec yds": parseFloat(document.getElementById('recyds')?.value || '0.1'),
        "Pass TD": parseInt(document.getElementById('passtd')?.value || '4'),
        "Rush TD": parseInt(document.getElementById('rushtd')?.value || '6'),
        "Rec TD": parseInt(document.getElementById('rectd')?.value || '6'),
        "Other TD": parseInt(document.getElementById('othertd')?.value || '6'),
        "Rec": parseFloat(document.getElementById('rec')?.value || '1'),
        "Int": parseInt(document.getElementById('int')?.value || '-2'),
        "Fumble": parseInt(document.getElementById('fumble')?.value || '-2'),
        "2P Conv": parseInt(document.getElementById('conv2p')?.value || '2'),
        "2P Pass": parseInt(document.getElementById('pass2p')?.value || '2')
    };
    
    return {
        league_settings: leagueSettings,
        roster_settings: rosterSettings,
        scoring_settings: scoringSettings
    };
}

// === ALL POSITIONS PRESENT IN CONFIG VALIDATION ===
/**
 * Validate that all required positions are present in the configuration.
 * This checks that at least one of each position is included in the starter/flex inputs.
 */
function getPositionCounts() {
    // Parse integers from all relevant starter/flex inputs
    const val = id => parseInt(document.getElementById(id)?.value || "0", 10);

    return {
        qb:   val("qb")   + val("qbwrrbte"),
        rb:   val("rb")   + val("wrrb") + val("wrrbte") + val("qbwrrbte"),
        wr:   val("wr")   + val("wrrb") + val("wrte") + val("wrrbte") + val("qbwrrbte"),
        te:   val("te")   + val("wrte") + val("wrrbte") + val("qbwrrbte"),
    };
}

function validatePositions() {
    const { qb, rb, wr, te } = getPositionCounts();
    const valid = qb >= 1 && rb >= 1 && wr >= 1 && te >= 1;

    if (valid) {
        return true
    } else {
        return false
    }
}

// === AWS Lambda Communication ===

async function checkConfigStatusWithLambda() {
    /**
     * Check configuration status using AWS Lambda (READ-ONLY)
     */
    const now = Date.now();
    
    if (now - lastApiCall < MIN_API_INTERVAL) {
        console.log('Skipping API call - too recent');
        return;
    }
    
    try {
        const currentConfig = getFormConfigData();
        const configWithId = updateConfigWithGeneratedIds(currentConfig);
        
        const lambdaPayload = {
            action: "check_status",
            league_config_id: configWithId.league_config_id,
            readable_name: configWithId.readable_name,
            league_settings: configWithId.league_settings,
            roster_settings: configWithId.roster_settings,
            scoring_settings: configWithId.scoring_settings,
        };
        
        console.log('Checking config status (read-only):', lambdaPayload);
        lastApiCall = now;
        
        const lambdaResponse = await fetch(AWS_LAMBDA_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(lambdaPayload)
        });
        
        console.log('Response status:', lambdaResponse.status);
        console.log('Response headers:', Object.fromEntries(lambdaResponse.headers.entries()));
        
        switch (lambdaResponse.status) {
            case 200:
                // Lambda response is successful. Move onto handling of response details.
                const result = await lambdaResponse.json();
                console.log('Lambda response:', result);
                handleStatusResponse(result, configWithId);
                break;
                
            case 400:
                // Handle 400 Bad Request specifically
                let errorMessage = 'Bad request - invalid payload format';
                try {
                    const errorResult = await lambdaResponse.json();
                    errorMessage = errorResult.message || errorResult.error || errorMessage;
                    console.error('400 Error details:', errorResult);
                } catch (e) {
                    console.error('Could not parse 400 error response');
                }
                
                updateStatus('error', {
                    message: errorMessage,
                    details: 'Please check the configuration format and try again.'
                });
                break;
                
            case 404:
                // Configuration not found - show submit button
                updateStatus('error', {
                    name: `${configWithId.readable_name}.pdf`,
                    configId: configWithId.league_config_id
                });
                break;
                
            default:
                let defaultErrorMessage = 'Network or server error occurred.';
                try {
                    const errorResult = await lambdaResponse.json();
                    if (errorResult.message) {
                        defaultErrorMessage = errorResult.message;
                    }
                } catch (e) {
                    defaultErrorMessage = `HTTP ${lambdaResponse.status}: ${lambdaResponse.statusText}`;
                }
                
                updateStatus('error', {
                    message: defaultErrorMessage,
                    details: `HTTP ${lambdaResponse.status} error`
                });
                break;
        }
    
    } catch (error) {
        console.error('Error checking config status:', error);
        updateStatus('error', {
            message: `${error.message}`,
            details: 'Check your internet connection and try again.'
        });
    }
}

async function submitConfigDirectly() {
    /**
     * Direct submission function (for manual submit button)
     */
    try {
        // Show loading state
        const submitButton = event.target;
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Submitting...';
        submitButton.disabled = true;
        
        // Get current form configuration
        const currentConfig = getFormConfigData();
        const configWithId = updateConfigWithGeneratedIds(currentConfig);
        
        // Prepare the payload for actual submission
        const payload = {
            action: "submit_config",
            league_config_id: configWithId.league_config_id,
            readable_name: configWithId.readable_name,
            league_settings: configWithId.league_settings,
            roster_settings: configWithId.roster_settings,
            scoring_settings: configWithId.scoring_settings,
        };
        
        console.log('Submitting config:', payload);
        
        // Send to AWS Lambda for actual submission
        const response = await fetch(AWS_LAMBDA_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        console.log('Submission response status:', response.status);
        
        // Reset button state
        submitButton.textContent = originalText;
        submitButton.disabled = false;

        result = await response.json();

        handleSubmitResponse(result, configWithId);

    } catch (error) {
        console.error('Error in direct submission:', error);
        handleSubmitResponse({
            status: 'error',
            message: `Network error: ${error.message}`,
            details: 'Check your internet connection and try again.'
        }, configWithId);
    }
}

async function sendDownloadInfoToLambda(configId, downloadUrl, filename) {
    /**
     * Track when a PDF is downloaded by sending analytics to Lambda
     */
    try {
        const payload = {
            action: "sheet_downloaded",
            league_config_id: configId,
            timestamp: new Date().toISOString(),
            filename: filename
        };
        
        console.log('Tracking download:', payload);
        
        fetch(AWS_LAMBDA_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        }).catch(error => {
            console.warn('Download tracking failed (non-critical):', error);
        });
        
        window.open(downloadUrl, '_blank');
        
    } catch (error) {
        console.warn('Download tracking error (non-critical):', error);
        window.open(downloadUrl, '_blank');
    }
}

function handleStatusResponse(result, configWithId) {
    /**
     * Handle the status response from Lambda
     */
    switch(result.status) {
        case 'success':
            fetchExistingPDF(configWithId);
            break;
            
        case 'pending':
            if (result.message && result.message.toLowerCase().includes('github')) {
                updateStatus('submission-pending-github', {
                    message: 'Github',
                    configId: configWithId.league_config_id,
                    eta: result.eta || 0
                });
            } else {
                updateStatus('submission-pending-aws', {
                    message: 'AWS',
                    configId: configWithId.league_config_id,
                    eta: result.eta || 0,
                });
            }
            break;

        case 'config-needed':
            updateStatus('submission-needed', {
                name: `${configWithId.readable_name}.pdf`,
                configId: configWithId.league_config_id
            });
            break;
            
        case 'error':
            updateStatus('error', {
                message: result.message || 'Server error occurred while checking configuration.',
                details: result.details || 'No additional details available'
            });
            break;
            
        default:
            console.warn('Unknown status received:', result.status);
            updateStatus('error', {
                name: `${configWithId.readable_name}.pdf`,
                configId: configWithId.league_config_id
            });
    }
}

function handleSubmitResponse(result, configWithID){
    /**
     * Handle the response after submitting configuration
     */
    if (result.status === 'success') {
        // Configuration submitted successfully
        updateStatus('submission-success', {
            message: 'Configuration submitted successfully!',
            configId: configWithID.league_config_id
        });
        
    } else {
        // Handle other statuses
        updateStatus('error', {
            message: result.message || 'An error occurred while submitting configuration.',
            details: result.details || 'No additional details available'
        });
    }
}

// === DEBOUNCED CONFIG CHECKING ===

async function fetchGeneratedSheets(configWithId) {
    /**
     * Fetch the list of generated sheets for a specific configuration
     */
    try {
        const response = await fetch(`${GITHUB_SHEETS_API}${configWithId.league_config_id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch generated sheets');
        }
        const generatedSheets = await response.json();
        return generatedSheets.filter(file => file.name.endsWith('.pdf'));
    } catch (error) {
        console.error('Error fetching generated sheets:', error);
        return [];
    }
}

async function fetchExistingPDF(configWithId) {
    /**
     * Check if PDF file exists and is accessible
     */
    try {

        const generatedSheets = await fetchGeneratedSheets(configWithId);
        const matchingPDF = generatedSheets.find(file => 
            file.name === `${configWithId.readable_name}_${formattedDate}.pdf`
        );

        if (matchingPDF) {
            updateStatus('pdf-available', {
                name: matchingPDF.name,
                url: matchingPDF.download_url
            });
        } else {
            updateStatus('submission-pending', {
                message: 'Configuration exists but PDF is not yet available.',
                configId: configWithId.league_config_id
            });
        }
    } catch (error) {
        console.error('Error checking for PDF:', error);
        updateStatus('error', {
            message: `Error checking PDF availability: ${error.message}`,
            configId: configWithId.league_config_id
        });
    }
}

function updateStatus(status, data = null) {
    const statusHeading = document.getElementById('status-heading');
    const statusContentElement = document.querySelector('.status-content');
    const statusTextElements = document.querySelectorAll('.status-text');
    
    // Clear any existing intervals first
    if (typeof awsPendingInterval !== 'undefined') {
        clearInterval(awsPendingInterval);
        awsPendingInterval = null;
    }
    
    if (typeof githubPendingInterval !== 'undefined') {
        clearInterval(githubPendingInterval);
        githubPendingInterval = null;
    }
    
    function statusButton({
        onclick,
        label,
        icon = '',
        className = ''
    }) {
        return `<button
            class="status-btn ${className}"
            onclick="${onclick}"
        >${icon}${label}</button>`;
    }

    // Set up dynamic h2 background color and status content
    let h2Bg = '';
    let statusTextColor = '';
    let content = '';
    
    switch (status) {
        case 'loading':
            h2Bg = 'var(--main-gray, #aaa)';
            statusContentElement.className = 'status-content status-loading';
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="loading-spinner"></span>Processing...
                    </div>
                </div>
            `;
            break;

        case 'invalid-config-missing-position':
            h2Bg = 'var(--main-pink)';
            statusTextColor = 'var(--main-pink)';
            statusContentElement.className = 'status-content status-invalid';
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="material-symbols-outlined status_icons">error</span>Invalid Configuration
                    </div>
                    <div class="status-message">All offensive positions must be represented.</div>
                </div>
            `;
            break;        
        
        case 'pdf-available':
            h2Bg = 'var(--main-green)';
            statusTextColor = 'var(--main-green)';
            statusContentElement.className = 'status-content status-success';
            const currentConfig = getFormConfigData();
            const configWithId = updateConfigWithGeneratedIds(currentConfig);
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="material-symbols-outlined status_icons">check</span>PDF Available
                    </div>
                    <div class="status-message">Configuration ID: ${configWithId.league_config_id}</div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: `sendDownloadInfoToLambda('${configWithId.league_config_id}', '${data.url}', '${data.name}')`, 
                        label: "Download",
                        icon: `<span class="material-symbols-outlined status_icons">download</span>`,
                        className: 'btn-success'
                    })}
                </div>
            `;
            break;

        case 'submission-needed':
            h2Bg = 'var(--main-purple)';
            statusTextColor = 'var(--main-purple)';
            statusContentElement.className = 'status-content status-submit';
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="material-symbols-outlined status_icons">cloud_alert</span>New Configuration Detected
                    </div>
                    <div class="status-message">Submit configuration to proceed.</div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: "submitConfigDirectly()",
                        label: "Submit",
                        icon: `<span class="material-symbols-outlined status_icons">upload</span>`,
                        className: 'btn-submit'
                    })}
                </div>
            `;
            break;

        case 'submission-pending-aws':
            h2Bg = 'var(--main-teal)';
            statusTextColor = 'var(--main-teal)';
            statusContentElement.className = 'status-content status-pending';
            content = `
                <div class="status-info status-pending-info" style="transform: scale(1.1);">
                    <div class="process-status-container">
                        <div class="process-step-container">
                            <span class="process-step process-step-active">1</span>
                            <div class="process-text-container">
                                <span class="process-text process-text-bold">Preparing</span>
                                <span class="process-text process-text-highlight">${data && data.eta ? data.eta: "< 1"} min rem.</span>
                            </div>
                        </div>
                        <div class="process-status-divider"></div>
                        <div class="process-step-container" style="padding-left: 0.5em;">
                            <span class="process-step">2</span>
                            <div class="process-text-container">
                                <span class="process-text process-text-bold">Generating</span>
                                <span class="process-text process-text-pending">Pending</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: "debouncedConfigCheck()",
                        label: "",
                        icon: `<span class="material-symbols-outlined status_icons">refresh</span>`,
                        className: 'btn-pending'
                    })}
                </div>
            `;

            awsPendingInterval = setInterval(() => {
                checkConfigStatusWithLambda();
            }, 5000); // Check every 5 seconds

            break;

        case 'submission-pending-github':
            h2Bg = 'var(--main-teal)';
            statusTextColor = 'var(--main-teal)';
            statusContentElement.className = 'status-content status-pending';
            content = `
                <div class="status-info status-pending-info" style="transform: scale(1.1);">
                    <div class="process-status-container">
                        <div class="process-step-container">
                            <span class="material-symbols-outlined process-step process-step-active">check</span>
                            <div class="process-text-container">
                                <span class="process-text process-text-bold">Processed</span>
                                <span class="process-text process-text-highlight">Complete</span>
                            </div>
                        </div>
                        <div class="process-status-divider"></div>
                        <div class="process-step-container" style="padding-left: 0.5em;">
                            <span class="process-step process-step-active">2</span>
                            <div class="process-text-container">
                                <span class="process-text process-text-bold">Generating</span>
                                <span class="process-text process-text-pending">${data && data.eta ? data.eta: "< 1"} min rem.</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: "debouncedConfigCheck()",
                        label: "",
                        icon: `<span class="material-symbols-outlined status_icons">refresh</span>`,
                        className: 'btn-pending'
                    })}
                </div>
            `;

            githubPendingInterval = setInterval(() => {
                checkConfigStatusWithLambda();
            }, 5000); // Check every 5 seconds

            break;
    
        case 'submission-success':
            h2Bg = 'var(--main-green)';
            statusTextColor = 'var(--main-green)';
            statusContentElement.className = 'status-content status-success';
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="material-symbols-outlined status_icons">check</span>Submission Successful
                    </div>
                    <div class="status-message">${data && data.message ? data.message : 'Your submission was received. PDF generation in progress.'}</div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: "debouncedConfigCheck()",
                        label: "Refresh",
                        icon: `<span class="material-symbols-outlined status_icons">refresh</span>`,
                        className: 'btn-success'
                    })}
                </div>
            `;
            break;

        case 'error':
            h2Bg = 'var(--main-red)';
            statusTextColor = 'var(--main-red)';
            statusContentElement.className = 'status-content status-error';
            content = `
                <div class="status-info">
                    <div class="status-title">
                        <span class="material-symbols-outlined status_icons">error</span>Error
                    </div>
                    <div class="status-message">${data && data.message ? data.message : 'An error occurred.'}</div>
                </div>
                <div class="status-actions">
                    ${statusButton({
                        onclick: "debouncedConfigCheck()",
                        label: "Refresh",
                        icon: `<span class="material-symbols-outlined status_icons">refresh</span>`,
                        className: 'btn-error'
                    })}
                </div>
            `;
            break;

        default:
            h2Bg = '';
            statusTextColor = 'var(--main-gray)';
            statusContentElement.className = 'status-content';
            content = '';
    }

    // Always set to "Status", only background changes:
    if (statusHeading) {
        statusHeading.textContent = "Status";
        statusHeading.setAttribute("style", `background: ${h2Bg};`);
    }

    // Update status text color in how-to section
    statusTextElements.forEach(element => {
        element.style.background = statusTextColor;
    });

    statusContentElement.innerHTML = content;
}

function debouncedConfigCheck() {
    // Bump version to invalidate prior checks
    configCheckVersion++;

    // Clear timeouts
    if (checkConfigTimeout) clearTimeout(checkConfigTimeout);
    if (artificialDelayTimeout) clearTimeout(artificialDelayTimeout);

    if (!validatePositions()) {
        updateStatus('invalid-config-missing-position');
        return;
    }

    updateStatus('loading');
    const thisVersion = configCheckVersion;

    artificialDelayTimeout = setTimeout(() => {
        checkConfigTimeout = setTimeout(() => {
            // Only proceed if the config hasn't changed in the meantime
            if (thisVersion === configCheckVersion) {
                checkConfigStatusWithLambda();
            }
        }, DEBOUNCE_DELAY);
    }, 750);
}

// === EVENT HANDLERS ===

// Enhanced event handlers with debouncing
function handleNumberInputs(wrapper, forceInteger = false) {
    let input = wrapper.querySelector('input[type="number"]');
    if (!input) return;

    input.dataset.prevValue = input.value;
    input.dataset.changed = "false";

    input.addEventListener('input', function() {
        if (input.value !== input.dataset.prevValue) {
            input.dataset.changed = "true";
        }
    });

    function handleInputChange() {
        let val = forceInteger ? parseInt(input.value, 10) : parseFloat(input.value);
        let min = input.min !== "" ? (forceInteger ? parseInt(input.min, 10) : parseFloat(input.min)) : -Infinity;
        let max = input.max !== "" ? (forceInteger ? parseInt(input.max, 10) : parseFloat(input.max)) : Infinity;

        // If forcing integer, round if value is a float
        if (forceInteger && !isNaN(input.value) && input.value !== "" && !Number.isInteger(Number(input.value))) {
            val = Math.round(Number(input.value));
        }

        // For floats: round to hundredths place
        if (!forceInteger && !isNaN(val)) {
            val = Math.round(val * 100) / 100;
        }

        if (isNaN(val)) {
            input.value = min;
        } else if (val < min) {
            input.value = min;
        } else if (val > max) {
            input.value = max;
        } else {
            // Convert to string and remove trailing zeros after decimal
            input.value = parseFloat(val.toFixed(2)).toString();
        }

        if (input.dataset.changed === "true" || input.value !== input.dataset.prevValue) {
            input.dataset.prevValue = input.value;
            input.dataset.changed = "false";
            debouncedConfigCheck();
        }
    }

    wrapper.addEventListener('focusout', function(event) {
        if (!wrapper.contains(event.relatedTarget)) {
            handleInputChange();
        }
    });

    wrapper.querySelectorAll('.number-input-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            handleInputChange();
        });
    });
}

// For all number input wrappers: determine if they should force integers or allow floats
document.querySelectorAll('.number-input-wrapper').forEach(function(wrapper) {
    const input = wrapper.querySelector('input[type="number"]');
    if (!input) return;
    
    // If step is 1 or not defined, force integers. If step is decimal, allow floats
    const step = parseFloat(input.step) || 1;
    const forceInteger = step >= 1;
    
    handleNumberInputs(wrapper, forceInteger);
});

// Add event listeners for draft type radio buttons
document.addEventListener('DOMContentLoaded', function() {
    // Initialize auction fields state
    toggleAuctionFields();
    
    const radioButtons = document.querySelectorAll('input[name="draft-type"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            toggleAuctionFields();
            debouncedConfigCheck();
        });
    });

    const rosterPriorityButtons = document.querySelectorAll('input[name="roster-priorities"]');
    rosterPriorityButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            debouncedConfigCheck();
        });
    });
    
    // Initial check with short delay to allow page to settle
    setTimeout(() => {
        debouncedConfigCheck();
    }, 500);
});
