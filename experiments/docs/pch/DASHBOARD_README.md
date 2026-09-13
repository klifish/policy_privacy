# 📊 Policy Content Hiding Experiment Dashboard

An interactive web dashboard for visualizing and analyzing the Policy Content Hiding experiment results.

## 🚀 Quick Start

### 1. Start the Dashboard Server

```bash
cd experiments/analysis/crosscheck/pch
node server.js
```

The server will start at `http://localhost:3000`

### 2. Open in Browser

Visit http://localhost:3000 in your web browser.

### 3. Load Data

The dashboard can load data in two ways:

**Option A: Auto-load (if results exist)**
- The dashboard will automatically try to load `results/execution_results.json`
- If found, data will be displayed immediately

**Option B: Manual upload**
- Click "Choose File" and select your `execution_results.json`
- The dashboard will parse and display the data

## 📈 Dashboard Features

### 1. **Experiment Overview**
- Total number of executions
- Number of unique policies
- Number of DUO terms tested
- Average gas consumption
- Average proof size

### 2. **Privacy Test Results**
- Classification accuracy for each DUO term
- AUC (Area Under ROC Curve) scores
- Advantage over random baseline
- Pass/Fail status for privacy thresholds

### 3. **Gas Consumption Analysis**
- Bar chart comparing gas usage by policy type
- Detailed statistics table (min, max, average, range)
- **Key metric**: Check if all gas values are identical
  - ✅ **SUCCESS**: All equal → Perfect padding
  - ⚠️ **WARNING**: Small difference → Partial leakage
  - ❌ **FAIL**: Large difference → Significant leakage

### 4. **Feature Distribution**
- Bar chart showing uniqueness of each feature
- Lower unique values = better privacy
- Ideal: All features have only 1 unique value

### 5. **DUO Term Distribution**
- Pie chart showing distribution of DUO terms
- Helps verify balanced dataset

### 6. **Execution Details Table**
- First 50 execution records
- Shows policy ID, DUO terms, gas consumption, proof size, etc.

## 🔍 How to Interpret Results

### Gas Padding Effectiveness

**Perfect Privacy (Goal)**:
```
GR: 7,050,000 gas
DS: 7,050,000 gas
RS: 7,050,000 gas
Max difference: 0 gas ✅
```

**Partial Leakage**:
```
GR: 7,036,985 gas
DS: 7,037,347 gas (+362 gas)
RS: 7,037,341 gas (+356 gas)
Max difference: 362 gas ⚠️
Relative: 0.005% - Minimal leakage
```

**Significant Leakage**:
```
GR: 5,500,000 gas
DS: 6,200,000 gas (+700k gas)
RS: 6,150,000 gas (+650k gas)
Max difference: 700,000 gas ❌
Relative: 12.7% - Major privacy issue
```

### ML Attack Results

**Strong Privacy (Goal)**:
- AUC: 0.48 - 0.52 (near random 0.5)
- Advantage: -5% to +5%
- Status: ✅ PASS

**Weak Privacy**:
- AUC: 0.55 - 0.65
- Advantage: 5% - 15%
- Status: ⚠️ PARTIAL PASS

**Privacy Failure**:
- AUC: > 0.70
- Advantage: > 20%
- Status: ❌ FAIL

## 📁 File Structure

```
experiments/analysis/crosscheck/pch/
├── dashboard.html          # Dashboard UI
├── server.js               # HTTP server
└── ../../../results/crosscheck/pch/
│   ├── execution_results.json      # Main data file
│   ├── evaluation_report.json      # ML attack results
│   └── features.json              # Extracted features
```

## 🛠 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Use a different port
PORT=3001 node server.js
```

### Dashboard shows "Loading..." forever
- Check browser console for errors (F12)
- Ensure `results/execution_results.json` exists
- Try manual file upload instead

### Charts not rendering
- Ensure you have internet connection (Chart.js loads from CDN)
- Check browser console for JavaScript errors
- Try refreshing the page

### Data looks incorrect
- Verify the JSON file format matches expected structure
- Check file modification date to ensure it's the latest
- Re-run the experiment if data is corrupted

## 🔗 Related Commands

```bash
# Run full experiment
node run_experiment.js --policy-count 50 --executions-per-policy 20

# Run with specific phase
node run_experiment.js --phase 3 --execution-results results/execution_results.json

# Quick gas padding test
node test_gas_fix.js
```

## 📝 Notes

- The dashboard is read-only - it doesn't modify any files
- All analysis is done client-side in the browser
- Server only serves static files
- Safe to refresh/reload without losing data

## 🎨 Customization

To customize the dashboard:
1. Edit `dashboard.html` for UI changes
2. Modify Chart.js options for different visualizations
3. Add new metrics by extending the render functions

## 📮 Support

For issues or questions:
- Check the experiment logs
- Review the evaluation report
- Consult the main SUMMARY.md documentation
