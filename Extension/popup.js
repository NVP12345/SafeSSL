setTimeout(function() {
    var bgPage = chrome.extension.getBackgroundPage(),
            enabledCheckbox = document.getElementById('enabled'),
            enabled404Checkbox = document.getElementById('enabled-404'),
            protocolToUseSelect = document.getElementById('protocol-to-use'),
            rootServerTextfield = document.getElementById('root-server'),
            saveButton = document.getElementById('save-config-button'),
            timeoutField = document.getElementById('timeout'),
            redirectTimeoutField = document.getElementById('redirect-timeout'),
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
    redirectTimeoutField.value = conf.redirectTimeout;
    enabledCheckbox.checked = conf.enabled;
    enabled404Checkbox.checked = conf.enabled404;
    protocolToUseSelect.value = conf.protocol;
    rootServerTextfield.value = conf.rootServer;

    enableDisableInputs(conf.enabled);

    enabledCheckbox.addEventListener('change', function() {
        var msg = '';
        if (enabledCheckbox.checked) {
            conf.enabled = true;
            msg = "SafeSSL enabled";
        } else {
            conf.enabled = false;
            msg = "SafeSSL disabled";
        }

        enableDisableInputs(conf.enabled);
        notify(msg);
    });

    enabled404Checkbox.addEventListener('change', function() {
        var msg = '';
        if (enabled404Checkbox.checked) {
            conf.enabled404 = true;
            msg = 'Redirect to http on 404 enabled';
        } else {
            conf.enabled404 = false;
            msg = 'Redirect to http on 404 disabled';
        }

        notify(msg);
    });


    function enableDisableInputs(enabled) {
        var inputs = document.getElementsByTagName('input'),
                i;

        for (i = 0; i < inputs.length; i++) {
            inputs[i].disabled = !enabled;
        }

        enabledCheckbox.disabled = false;
    }

    saveButton.addEventListener('click', function() {
        var timeout = timeoutField.value,
                redirectTimeout = redirectTimeoutField.value,
                notification = [];


        if (timeout && /^[0-9]+$/.test(timeout)) {
            conf['cacheTimeout'] = parseInt(timeoutField.value) * 1000;
            notification.push('Cache timeout saved.');
        } else {
            notification.push('Cache timeout save failed.');
        }

        if (redirectTimeout && /^[0-9]+$/.test(redirectTimeout)) {
            conf['redirectTimeout'] = parseInt(redirectTimeout);
            notification.push('Redirect timeout saved');
        } else {
            notification.push('Redirect timeout save failed');
        }

        if (conf.protocol != protocolToUseSelect.value) {
            conf.protocol = protocolToUseSelect.value;
            notification.push('Protocol changed');
        }
        
        if (rootServerTextfield.value != conf.rootServer){
            conf.rootServer = rootServerTextfield.value;
            notification.push('Root server changed');
        }

        notify(notification.join('<br/>'));
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