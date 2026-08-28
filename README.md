# USAR Quartermaster Corps Uniform Price Calculator

Community-maintained fork of the [original calculator](https://github.com/ProEJ78/uniform-price-calculator) by ProEJ78.

**Live site:** https://codythebeast89.github.io/uniform-price-calculator/

Calculate uniform order prices and generate copyable ordering templates for QMC.

Item lists follow the [QMC Uniform Guide](https://docs.google.com/document/d/1fc9gU7zDWnZu_3xoFPyP9NUH3D0jb9kDJG7SaAFitOM/edit).

## Updating prices

Edit the `uniformData` object in `index.html`. Each uniform has a `basePrice`, plus optional `ribbons`, `badges`, `foreignDevices`, and `accessories` arrays with per-item `price` values.
