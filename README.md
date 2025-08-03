# neat.sheet

neat.sheet is a tool for generating simple, yet informative, made-to-print Fantasy Football draft sheets tailored to your league's unique settings.

---

## What neat.sheet Does

neat.sheet uses the latest FantasyPROs projections, ESPN injury reports, and various historical data to generate projected VORP values for any given league configuration. All of this is then manicured into a single printable draft sheet for you to use on draft day.

---

## How to Use neat.sheet

1. **Set Up Your League**
   - Use the League panel to select the number of teams, draft type (Snake or Auction), and roster positions (QB, RB, WR, TE, etc.).
   - Adjust each value using the +/– buttons or by typing directly into the field.
   - For Auction drafts, set your budget and roster value preferences.

2. **Customize Scoring**
   - In the Scoring panel, set how many points are awarded for each stat (receptions, yards, touchdowns, etc.).
   - Tooltips are available for most fields to help clarify scoring options.

3. **Check for Your Draft Sheet**
   - As you change settings, the Status area above the form will automatically check if a draft sheet PDF already exists for your configuration.
   - If a match is found, a download link will appear instantly.

4. **Submit for a New Sheet (if needed)**
   - If no sheet exists for your setup, you’ll see a prompt to submit your configuration.
   - Click the submit button. Your settings will be sent for processing.
   - After a few minutes, refresh the page or re-enter your settings to check if your PDF is ready.

5. **Automatic Daily Updates**
    - Once submitted, your draft sheet will be regenerated daily with the latest player projections and injury statuses—**except for Auction draft sheets, which are not updated daily**.
   - You can always revisit the site and re-enter your settings to get the latest version.

## What Happens Behind the Scenes
- When you submit your configuration, it’s saved and queued for PDF generation.
- Once generated, your draft sheet is stored and will be instantly available for anyone with the same settings in the future.
- Submitted configurations will continue to be regenerated daily with updated projections and injury statuses.
- All sheets are organized by a unique ID based on your league and scoring settings.

---

## FAQ

**Q: Is my data saved or shared?**  
A: Only your league settings and scoring rules are saved, for the purpose of generating and storing the draft sheet. No personal or identifying information is collected.

**Q: How long does it take to get a new sheet?**  
A: Usually just a few minutes. If it takes longer, try refreshing the page after a short wait.

**Q: Can I use this for any league?**  
A: Yes! As long as your league’s settings fit the available options, you can generate a sheet for it.

---

## License
See `LICENSE` for details.