setTimeout(function() {
    var bgPage = chrome.extension.getBackgroundPage(),
            saveButton = document.getElementById('save-config-button'),
            timeoutField = document.getElementById('timeout'),
            clearCacheButton = document.getElementById('clear-cache-button'),
            saveDomainButton = document.getElementById('save-domain-button'),
            domainInput = document.getElementById('domain'),
            domainToQueryInput = document.getElementById('domain-to-query'),
            queryButton = document.getElementById('query-domain-button'),
            queryNotification = document.getElementById('query-notification'),
            clearQueryButton = document.getElementById('clear-query-domain-button'),
            httpsSupportedSelect = document.getElementById('https-supported-value'),
            conf = bgPage.getConfig();


    timeoutField.value = conf.cacheTimeout / 1000;

    saveButton.addEventListener('click', function() {
        var timeout = timeoutField.value;

        if (timeout && /^[0-9]+$/.test(timeout)) {
            conf['cacheTimeout'] = parseInt(timeoutField.value) * 1000;
        }

        notify('Configuration saved');
    });

    clearCacheButton.addEventListener('click', function() {
        bgPage.clearCache();
        notify('Cache cleared');
    });

    saveDomainButton.addEventListener('click', function() {
        var domain = domainInput.value,
                httpsEnabled = httpsSupportedSelect.value;

        if (domain && httpsEnabled) {
            var enabled = false;
            if (httpsEnabled == 'yes') {
                enabled = true;
            }

            bgPage.addOrUpdateCache(domain, enabled);
            domainInput.value = '';

            notify('Domain added to the cache');
        }

    });

    queryButton.addEventListener('click', function() {
        var domain = domainToQueryInput.value,
                msg = "The domain doesn't exist in the cache";

        if (bgPage.isHttpsEnabled(domain)) {
            msg = "The domain supports https";
        } else {
            msg = "The domain doesn't support https";
        }

        queryNotification.innerHTML = msg;
    });

    clearQueryButton.addEventListener('click', function() {
        queryNotification.innerHTML = '';
    });

}, 200);


function notify(msg) {
    var notificationDiv = document.getElementById('notification-center');
    notificationDiv.innerHTML = msg;

    if (notify.timeoutId) {
        clearTimeout(notify.timeoutId);
    }

    notify.timeoutId = setTimeout(function() {
        notify.timeoutId = null;
        notificationDiv.innerHTML = '';
    }, 3000);
}