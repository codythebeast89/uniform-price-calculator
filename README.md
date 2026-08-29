# USAR Quartermaster Corps Uniform Price Calculator

Community-maintained fork of the [original calculator](https://github.com/ProEJ78/uniform-price-calculator) by ProEJ78.

**Live site:** https://codythebeast89.github.io/uniform-price-calculator/

Calculate uniform order prices and generate copyable ordering templates for QMC.

Item lists follow the [QMC Uniform Guide](https://docs.google.com/document/d/1fc9gU7zDWnZu_3xoFPyP9NUH3D0jb9kDJG7SaAFitOM/edit), [Awards & Decorations](https://docs.google.com/document/d/1iTcTwtrTwjLhMUDras1Tq0NrxOIfmS4MADYSxnxG1Gg/edit), [Badge Information Trello](https://trello.com/b/o1GnoMon/quartermaster-corps-badge-information), [QMC Database](https://docs.google.com/spreadsheets/d/1e_AqHIGrGdfNSgoHt6kLV89E6LADJmlZzhfRAUXo0wY/edit), and [QMC Requisition Console](https://thebiggiant1122-afk.github.io/usar-qmc-console.github.io/). Custom PT, Mess Dress, Greenouts (SRT), and tattoos are excluded.

## Updating prices

Edit the `uniformData` object in `index.html`. Each uniform has a `basePrice`, plus optional `ribbons`, `badges`, `foreignRibbons`, `foreignBadges`, and `accessories` arrays with per-item `price` values.
