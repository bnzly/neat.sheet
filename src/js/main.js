// --- CONFIG: Set these for your repo/API endpoints ---
const GITHUB_CONFIGS_API = "https://api.github.com/repos/bnzly/neat.sheet/contents/league_configs/league_configs.json";
const GITHUB_SHEETS_API = "https://api.github.com/repos/bnzly/neat.sheet/contents/generated_sheets/";
const AWS_LAMBDA_API = "https://63foxil595.execute-api.us-east-2.amazonaws.com/Prod/neatsheet-league-config-handler";

// Debouncing variables
let checkConfigTimeout = null;
let artificialDelayTimeout = null;
let configCheckVersion = null;
let lastApiCall = 0;
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

// === LEAGUE CONFIGURATION ID GENERATOR ===
/**
 * Generate a unique 5-character ID for league configurations based on settings.
 * This ID is used to identify and differentiate league configurations.
 * It combines league settings and scoring settings into a consistent hash.
 */

function generateLeagueConfigId(leagueSettings, scoringSettings) {
    /**
     * Generate a 5-character hash ID based on league and scoring settings.
     */
    const combinedSettings = {...leagueSettings, ...scoringSettings};
    
    // Sort keys to ensure consistent ordering
    const sortedSettings = {};
    Object.keys(combinedSettings).sort().forEach(key => {
    sortedSettings[key] = combinedSettings[key];
    });
    
    // Convert to JSON string for hashing (matches Python's json.dumps with sort_keys=True)
    const settingsString = JSON.stringify(sortedSettings);
    
    // Create MD5 hash (using crypto-js library)
    const hash = CryptoJS.MD5(settingsString).toString();
    
    // Take first 5 characters and convert to uppercase
    const configId = hash.substring(0, 5).toUpperCase();
    
    return configId;
}

function generateReadableName(leagueSettings, scoringSettings) {
    /**
     * Generate a human-readable name for the league configuration.
     */
    const teams = leagueSettings["# of Teams"] || "Unknown";
    const recPoints = scoringSettings["Rec"] || 0;
    
    // Define standard scoring settings
    const STANDARD_SCORING = {
    "Pass yds": 0.04, 
    "Rush yds": 0.1, 
    "Rec yds": 0.1,
    "Pass TD": 4, 
    "Rush TD": 6, 
    "Rec TD": 6, 
    "Other TD": 6,
    "Int": -2, 
    "Fumble": -2,
    "2P Conv": 2, 
    "2P Pass": 2
    };
    
    // Determine PPR type
    let pprType;
    if (recPoints === 1.0) {
    pprType = "PPR";
    } else if (recPoints === 0.5) {
    pprType = "HalfPPR";
    } else if (recPoints === 0) {
    pprType = "NoPPR";
    } else {
    pprType = `${recPoints}PPR`;
    }
    
    // Check if any scoring setting differs from standard (excluding Rec which is handled separately)
    let isCustomScoring = false;
    for (const [key, standardValue] of Object.entries(STANDARD_SCORING)) {
    if (scoringSettings.hasOwnProperty(key) && scoringSettings[key] !== standardValue) {
        isCustomScoring = true;
        break;
    }
    }
    
    let scoringType;
    if (isCustomScoring) {
    // Generate the config ID to append to custom scoring
    const configId = generateLeagueConfigId(leagueSettings, scoringSettings);
    scoringType = `Custom_Scoring_${configId}`;
    } else {
    const configId = generateLeagueConfigId(leagueSettings, scoringSettings);
    scoringType = `Default_Scoring_${configId}`;
    }
    
    return `${teams}_Team_${pprType}_${scoringType}`;
}

function updateConfigWithGeneratedIds(config) {
    /**
     * Update a single configuration with generated ID and readable name.
     */
    const configId = generateLeagueConfigId(config.league_settings, config.scoring_settings);
    const readableName = generateReadableName(config.league_settings, config.scoring_settings);
    
    return {
    ...config,
    league_config_id: configId,
    readable_name: readableName
    };
}

function getFormConfigData() {
    /**
     * Extract configuration data from the HTML form
     */
    const leagueSettings = {
    "# of Teams": parseInt(document.getElementById('teams').value),
    "# of weeks": parseInt(document.getElementById('weeks').value),
    "QB": parseInt(document.getElementById('qb').value),
    "RB": parseInt(document.getElementById('rb').value),
    "WR": parseInt(document.getElementById('wr').value),
    "TE": parseInt(document.getElementById('te').value),
    "WR/RB": parseInt(document.getElementById('wrrb').value),
    "WR/TE": parseInt(document.getElementById('wrte').value),
    "WR/RB/TE": parseInt(document.getElementById('wrrbte').value),
    "QB/WR/RB/TE": parseInt(document.getElementById('qbwrrbte').value),
    "Bench": parseInt(document.getElementById('bench').value),
    "K": parseInt(document.getElementById('k').value),
    "DST": parseInt(document.getElementById('dst').value)
    };
    
    const scoringSettings = {
    "Pass yds": parseFloat(document.getElementById('passyds').value),
    "Rush yds": parseFloat(document.getElementById('rushyds').value),
    "Rec yds": parseFloat(document.getElementById('recyds').value),
    "Pass TD": parseInt(document.getElementById('passtd').value),
    "Rush TD": parseInt(document.getElementById('rushtd').value),
    "Rec TD": parseInt(document.getElementById('rectd').value),
    "Other TD": parseInt(document.getElementById('othertd').value),
    "Rec": parseFloat(document.getElementById('rec').value),
    "Int": parseInt(document.getElementById('int').value),
    "Fumble": parseInt(document.getElementById('fumble').value),
    "2P Conv": parseInt(document.getElementById('conv2p').value),
    "2P Pass": parseInt(document.getElementById('pass2p').value)
    };
    
    return {
    league_settings: leagueSettings,
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

function handleStatusResponse(result, configWithId) {
    /**
     * Handle the status response from Lambda
     */
    switch(result.status) {
        case 'success':
            fetchExistingPDF(configWithId);
            break;
            
        case 'pending':
            updateStatus('submission-pending', {
                message: 'Configuration is currently being processed.',
                configId: configWithId.league_config_id,
                suggestion: 'Please wait a few minutes for PDF generation to complete.'
            });
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
    const fileListElement = document.getElementById('file-list');
    const statusTextElements = document.querySelectorAll('.status-text');
    
    function statusButton({
    onclick,
    label,
    color,
    icon = '', // New: icon field
    padding = '0.65em 1.2em',
    extra = ''
    }) {
    return `<button
        onclick="${onclick}"
        style="
        background: ${color}; 
        color: white; 
        border: none; 
        border-radius: var(--border-radius); 
        padding: ${padding}; 
        margin: auto; 
        font-weight: 600; 
        font-size: inherit;
        cursor: pointer; 
        display: flex; 
        align-items: center; 
        gap: 0.2em; 
        transition: all 0.2s ease; 
        ${extra}
    "
    onmouseover="this.style.opacity='.95'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'; this.style.transform='scale(1.01)'"
    onmouseout="this.style.opacity='1'; this.style.boxShadow='none'; this.style.transform='scale(1)'"
    >${icon}${label}</button>`;
    }

    function statusRow({ title, message, button, color, color_25, icon = '' }) {
    return `
        <div style="
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        background: ${color_25}; 
        color: ${color}; 
        padding: 1em; 
        border: var(--border-size, 2px) solid ${color};
        border-top: none;
        border-radius: 0px 0px var(--border-radius) var(--border-radius); 
        gap: 2em;
        height: 60px;
        ">
        <div style="flex: 1 1 0%;">
            <div style="display: flex; align-items: center; font-weight: 700; margin-bottom: 0.5em; gap: 0.2em;">
            ${icon} ${title}
            </div>
            <div style="font-size: 0.95em;">
            ${message}
            </div>
        </div>
        ${
            button
            ? `<div style="
                    flex-shrink:0;
                    display: flex;
                    align-items: center;
                    height: 100%;
                ">
                    ${button}
                </div>`
            : ""
        }
        </div>
    `;
    }

    // Set up dynamic h2 background color:
    let h2Bg = '';
    let statusTextColor = '';
    let rowArgs = null;
    switch (status) {
    case 'loading':
        h2Bg = 'var(--main-gray, #aaa)';
        rowArgs = {
        title: data || `<span style="display: flex; align-items: center;"><span class="loading-spinner" style="margin-right: 0.5em;"></span>Loading...</span>`,
        message: "",
        button: "",
        color: 'var(--main-gray)',
        color_25: 'var(--main-gray-25)',
        icon: ""
        };
        break;

    case 'invalid-config-missing-position':
        h2Bg = 'var(--main-orange)';
        statusTextColor = 'var(--main-orange)';
        rowArgs = {
        title: 'Invalid Configuration',
        message: 'All offensive positions must be represented.',
        button: "",
        color: 'var(--main-orange)',
        color_25: 'var(--main-orange-25)',
        icon: `<span class="material-symbols-outlined status_icons">error</span>`
        };
        break;        
    
    case 'pdf-available':
        h2Bg = 'var(--main-green)';
        statusTextColor = 'var(--main-green)';
        rowArgs = {
        title: 'PDF Available',
        message: `<div style="display: flex; justify-content: center; width: 100%;">
            <a href="${data.url}" target="_blank" style="
                font-family: 'Avenir-Heavy';
                font-size: 0.95em;
                background: var(--main-green);
                color: white;
                text-decoration: none; 
                font-weight: 600; 
                border-radius: var(--border-radius); 
                padding: 0.5em 1em; 
                display: inline-flex; 
                align-items: center; 
                gap: 0.5em; 
                transition: all 0.2s ease;
            " onmouseover="this.style.opacity='.95'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)'; this.style.transform='scale(1.01)'"
                onmouseout="this.style.opacity='1'; this.style.boxShadow='none'; this.style.transform='scale(1)'">
                ${data.name}<span class="material-symbols-outlined status_icons">download</span></a>
        </div>`,
        button: "",
        color: 'var(--main-green)',
        color_25: 'var(--main-green-25)',
        icon: `<span class="material-symbols-outlined status_icons">check</span>`
        };
        break;

    case 'submission-needed':
        h2Bg = 'var(--main-purple)';
        statusTextColor = 'var(--main-purple)';
        rowArgs = {
        title: 'New Configuration Detected',
        message: 'Submit configuration to proceed.',
        button: statusButton({
            onclick: "submitConfigDirectly()",
            label: "Submit",
            color: "var(--main-purple)",
            icon: `<span class="material-symbols-outlined status_icons">upload</span>`
        }),
        color: 'var(--main-purple)',
        color_25: 'var(--main-purple-25)',
        icon: `<span class="material-symbols-outlined status_icons">cloud_alert</span>`
        };
        break;

    case 'submission-pending':
        h2Bg = 'var(--main-teal)';
        statusTextColor = 'var(--main-teal)';
        rowArgs = {
        title: 'Configuration Processing',
        message: data && data.details ? data.details : 'Check back later.',
        button: statusButton({
            onclick: "debouncedConfigCheck()",
            label: "Refresh",
            color: "var(--main-teal)",
            icon: `<span class="material-symbols-outlined status_icons">refresh</span>`
        }),
        color: 'var(--main-teal)',
        color_25: 'var(--main-teal-25)',
        icon: `<span class="material-symbols-outlined status_icons">pending</span>`
        };
        break;

    case 'submission-success':
        h2Bg = 'var(--main-green)';
        statusTextColor = 'var(--main-green)';
        rowArgs = {
        title: 'Submission Successful',
        message: data && data.message ? data.message : 'Your submission was received. PDF generation in progress.',
        button: statusButton({
            onclick: "debouncedConfigCheck()",
            label: "Refresh",
            color: "var(--main-green)",
            icon: `<span class="material-symbols-outlined status_icons">refresh</span>`
        }),
        color: 'var(--main-green)',
        color_25: 'var(--main-green-25)',
        icon: `<span class="material-symbols-outlined status_icons">check</span>`
        };
        break;

    case 'error':
        h2Bg = 'var(--main-red)';
        statusTextColor = 'var(--main-red)';
        rowArgs = {
        title: 'Error',
        message: data && data.message ? data.message : 'An error occurred.',
        button: statusButton({
            onclick: "debouncedConfigCheck()",
            label: "Refresh",
            color: "var(--main-red)",
            icon: `<span class="material-symbols-outlined status_icons">refresh</span>`
        }),
        color: 'var(--main-red)',
        color_25: 'var(--main-red-25)',
        icon: `<span class="material-symbols-outlined status_icons">error</span>`
        };
        break;

    default:
        h2Bg = '';
        statusTextColor = 'var(--main-gray)';
        rowArgs = null;
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

    fileListElement.innerHTML = rowArgs ? statusRow(rowArgs) : '';
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

// For league-settings-container: force integers
document.querySelectorAll('.league-settings-container .number-input-wrapper').forEach(function(wrapper) {
    handleNumberInputs(wrapper, true);
});

// For scoring-settings-container: allow floats to hundredths
document.querySelectorAll('.scoring-settings-container .number-input-wrapper').forEach(function(wrapper) {
    handleNumberInputs(wrapper, false);
});

// === INITIALIZATION ===

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initial check with short delay to allow page to settle
    setTimeout(() => {
    debouncedConfigCheck();
    }, 500);
});

