// Generated by CoffeeScript 1.3.3

/*
	basecamp: a wrapper for the basecamp json api
	todo:
		check for expired accesses
*/


(function() {
  var Account, Calendar, Client, Person, Project, fs, opPaths, request, url, _,
    __slice = [].slice;

  fs = require('fs');

  url = require('url');

  _ = require('underscore');

  request = require('request');

  opPaths = null;

  exports.Client = Client = (function() {

    function Client(client_id, client_secret, redirect_uri, userAgent) {
      this.client_id = client_id;
      this.client_secret = client_secret;
      this.redirect_uri = redirect_uri;
      this.userAgent = userAgent;
    }

    Client.prototype.getAuthNewUrl = function(state) {
      return "https://launchpad.37signals.com/authorization/new" + "?type=" + 'web_server' + "&client_id=" + this.client_id + "&redirect_uri=" + encodeURIComponent(this.redirect_uri) + (state ? "&state=" + encodeURIComponent(JSON.stringify(state)) : '');
    };

    Client.prototype.authNewCallback = function(req, res, cb) {
      var query, state, _ref, _ref1;
      query = url.parse(req.url, true).query;
      state = JSON.parse(decodeURIComponent((_ref = query.state) != null ? _ref : '{}'));
      if (query.error === 'access_denied') {
        res.end("<html><head>\n	<meta http-equiv=\"REFRESH\" content=\"0;url=" + ((_ref1 = state.href) != null ? _ref1 : '/') + "\">\n</head><body></body></html> ");
        return;
      }
      if (!query.code || query.error) {
        console.log('basecamp: err in authorization/new callback: ' + req.url);
        res.end();
        if (typeof cb === "function") {
          cb();
        }
        return;
      }
      return this._getToken(query, null, function(err, userInfo, html) {
        res.end(html);
        return typeof cb === "function" ? cb(err, userInfo) : void 0;
      });
    };

    Client.prototype._getToken = function(cbQuery, refresh_token, cb) {
      var form, href, html, state, tokenUrl, _ref, _ref1;
      tokenUrl = "https://launchpad.37signals.com/authorization/token" + "?client_id=" + this.client_id + "&redirect_uri=" + encodeURIComponent(this.redirect_uri) + "&client_secret=" + this.client_secret;
      form = {
        client_id: this.client_id,
        redirect_uri: this.redirect_uri,
        client_secret: this.client_secret
      };
      if (cbQuery) {
        tokenUrl += '&type=web_server&code=' + cbQuery.code;
        _.extend(form, {
          code: cbQuery.code
        });
        state = JSON.parse((_ref = cbQuery.state) != null ? _ref : '{}');
        href = (_ref1 = state.href) != null ? _ref1 : '/';
        html = "<html><head>\n	<meta http-equiv=\"REFRESH\" content=\"0;url=" + href + "\">\n</head><body></body></html> ";
      } else {
        tokenUrl += '&type=refresh&refresh_token=' + refresh_token;
        _.extend(form, {
          refresh_token: refresh_token
        });
      }
      return request({
        method: 'POST',
        uri: tokenUrl,
        form: form
      }, function(error, response, bodyJSON) {
        var tokenResp;
        if (error || bodyJSON.indexOf('"error":') !== -1) {
          console.log('\nbasecamp: token request error\n', {
            error: error,
            bodyJSON: bodyJSON,
            cbQuery: cbQuery,
            refresh_token: refresh_token
          });
          if (typeof cb === "function") {
            cb('token request error');
          }
          return;
        }
        tokenResp = JSON.parse(bodyJSON);
        return request({
          url: 'https://launchpad.37signals.com/authorization.json',
          headers: {
            Authorization: 'Bearer ' + tokenResp.access_token
          }
        }, function(error, response, bodyJSON) {
          var msg, userInfo;
          if (error || bodyJSON.indexOf('error:') !== -1) {
            msg = '\nbasecamp: error from authorization request\n';
            console.log(msg, {
              cbQuery: cbQuery,
              refresh_token: refresh_token,
              error: error,
              bodyJSON: bodyJSON
            });
            if (typeof cb === "function") {
              cb(msg);
            }
            return;
          }
          userInfo = _.extend(tokenResp, JSON.parse(bodyJSON), (state ? {
            state: state
          } : void 0));
          return typeof cb === "function" ? cb(null, userInfo, html) : void 0;
        });
      });
    };

    return Client;

  })();

  exports.Account = Account = (function() {

    function Account(client, accountId, refresh_token, cb) {
      var _this = this;
      this.client = client;
      this.accountId = accountId;
      this.account = null;
      client._getToken(null, refresh_token, function(err, userInfo) {
        var account, _i, _len, _ref, _ref1;
        _this.err = err;
        _this.userInfo = userInfo;
        if (_this.err || !_this.userInfo.accounts) {
          console.log('\nbasecamp: _getToken error', _this.accountId, refresh_token, _this.err, _this.userInfo);
          if (typeof cb === "function") {
            cb('_getToken error');
          }
          return;
        }
        _ref = _this.userInfo.accounts;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          account = _ref[_i];
          if (account.id === _this.accountId) {
            _this.account = account;
            break;
          }
        }
        if (!_this.account) {
          _this.err = 'basecamp: account not found, ' + _this.userInfo.identity.email_address + ', ' + _this.accountId;
          console.log('\nbasecamp ' + _this.err);
          cb(_this.err);
          return;
        }
        if (((_ref1 = _this.account) != null ? _ref1.product : void 0) !== 'bc3') {
          _this.err = 'basecamp: error, product ' + (account != null ? account.product : void 0) + ' not supported, ' + _this.userInfo.identity.email_address + ', ' + _this.accountId;
          console.log('\nbasecamp ' + _this.err);
          cb(_this.err);
          return;
        }
        return cb(null, _this);
      });
    }

    Account.prototype.req = function(op, options, cb) {
      var abortStream, body, file, haveQM, headers, id, k, numResults, path, qStr, query, replacement, reqCB, requestOpts, section, stream, streamIt, url, urlReplacements, v, _i, _len, _ref,
        _this = this;
      if (!this.account) {
        cb('basecamp: req error, no account');
        return;
      }
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      if (!(path = opPaths[op])) {
        cb('basecamp: req error, invalid opcode ' + op);
        return;
      }
      section = options.section, id = options.id, query = options.query, headers = options.headers, body = options.body, stream = options.stream, file = options.file, url = options.url, getAll = options.getAll;

      requestOpts = {
        headers: {
          'User-Agent': this.client.userAgent,
          Authorization: 'Bearer ' + this.userInfo.access_token
        }
      };
      if ((_ref = path[0]) === 'P' || _ref === 'D') {
        if (!body && !stream && !file) {
          cb('basecamp: req body/stream/file missing', op, options);
          return;
        }
        if (body) {
          requestOpts.json = body;
        }
        requestOpts.method = path.split('/')[0];
        path = path.slice(requestOpts.method.length);
      }
      urlReplacements = [['~primaryId~', this.primaryId], ['~optionalId~', this.primaryId], ['~section~', section], ['~secondaryId~', id]];
      for (_i = 0, _len = urlReplacements.length; _i < _len; _i++) {
        replacement = urlReplacements[_i];
        if (path.indexOf(replacement[0]) !== -1) {
          if (!replacement[1]) {
            if (replacement[0] !== '~optionalId~') {
              cb('option ' + replacement[0].slice(1, -1) + ' missing for ' + path);
              return;
            }
            path = path.replace('/' + replacement[0], '');
          } else {
            path = path.replace(replacement[0], replacement[1]);
          }
        }
      }

      qStr = '';
      if (query) {
        haveQM = path.indexOf('?') !== -1;
        for (k in query) {
          v = query[k];
          qStr += (haveQM ? '&' : '?') + k + '=' + v;
          haveQM = true;
        }
      }
      // set url to next?
      if(url != null) {
        requestOpts.url = url;
      } else {
        requestOpts.url = this.account.href + path + qStr;
      }

      if (headers) {
        _.extend(requestOpts.headers, headers);
      }

      reqCB = function(error, response, bodyTxt) {
        if (typeof bodyTxt === 'string') {
          try {
            body = JSON.parse(bodyTxt);
          } catch (e) {
            error = bodyTxt;
          }
        } else {
          body = bodyTxt;
        }
        if (error) {
          console.log('\nbasecamp: req error, bad response ' + op + ' ' + _this.account.name, '\n\n', requestOpts, '\n\n', error);
          cb(error);
          return;
        }

        
        // get all results via pagination
        if(getAll) {
          var link = response.headers.link;
          var nextUrl = "";
          if(link != null) {
            var nextUrl = link.substring(
              link.lastIndexOf("<") + 1, 
              link.lastIndexOf(">")
            );
          }

          if(nextUrl) {
            _this.req(op, {url:nextUrl}, (error, result) => {
              return cb(null, body.concat(result));
            }); 
          } else {
              return cb(null, body);
          }
        } else {
          return cb(null, body);
        }

        
      };
      if (stream || file) {
        abortStream = false;
        streamIt = function() {
          var reqst;
          reqst = stream.pipe(request(requestOpts));
          reqst.on('response', function(resp) {
            if (resp.statusCode !== 200) {
              reqCB('bad stream status code ' + resp.statusCode + ', ' + requestOpts.url);
              return abortStream = true;
            }
          });
          reqst.on('data', function(resp) {
            if (!abortStream) {
              return reqCB(null, null, resp.toString());
            }
          });
          return reqst.on('error', function(resp) {
            if (!abortStream) {
              reqCB('stream error ' + requestOpts.url + ', ' + JSON.stringify(resp));
              return abortStream = true;
            }
          });
        };
        if (stream) {
          streamIt();
          return;
        }
        if (!requestOpts.headers['Content-Length'] && !requestOpts.headers['content-length']) {
          fs.stat(file, function(err, stats) {
            if (err) {
              reqCB('fs.stat error ' + requestOpts.url + JSON.stringify(err));
              return;
            }
            _.extend(requestOpts.headers, {
              'Content-Length': stats.size
            });
            stream = fs.createReadStream(file);
            return streamIt();
          });
          return;
        }
        stream = fs.createReadStream(file);
        return streamIt();
      } else {
        return request(requestOpts, reqCB);
      }
    };

    return Account;

  })();

  exports.Project = Project = (function() {

    function Project(account, projectId) {
      this.account = account;
      this.projectId = projectId;
      this.account.primaryId = 'projects/' + this.projectId;
    }

    Project.prototype.req = function() {
      var args, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return (_ref = this.account).req.apply(_ref, args);
    };

    return Project;

  })();

  exports.Calendar = Calendar = (function() {

    function Calendar(account, calendarId) {
      this.account = account;
      this.calendarId = calendarId;
      this.account.primaryId = 'calendars/' + this.calendarId;
    }

    Calendar.prototype.req = function() {
      var args, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return (_ref = this.account).req.apply(_ref, args);
    };

    return Calendar;

  })();

  exports.Person = Person = (function() {

    function Person(account, personId) {
      this.account = account;
      this.personId = personId;
      this.account.primaryId = 'people/' + this.personId;
    }

    Person.prototype.req = function() {
      var args, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return (_ref = this.account).req.apply(_ref, args);
    };

    return Person;

  })();

  opPaths = {
    get_accesses: '/~primaryId~/accesses.json',
    grant_access: 'POST/~primaryId~/accesses.json',
    revoke_access: 'DELETE/~primaryId~/accesses/~secondaryId~.json',
    create_attachment: 'POST/attachments.json',
    get_attachments: '/~optionalId~/attachments.json',
    get_calendar_events: '/~primaryId~/calendar_events.json',
    get_calendar_events_past: '/~primaryId~/calendar_events/past.json',
    get_calendar_event: '/~primaryId~/calendar_events/~secondaryId~.json',
    create_calendar_event: 'POST/~primaryId~/calendar_events.json',
    update_calendar_event: 'PUT/~primaryId~/calendar_events/~secondaryId~.json',
    delete_calendar_event: 'DELETE/~primaryId~/calendar_events/~secondaryId~.json',
    get_calendars: '/calendars.json',
    get_calendar: '/~primaryId~.json',
    create_calendar: 'POST/calendars.json',
    update_calendar: 'PUT/~primaryId~.json',
    delete_calendar: 'DELETE/~primaryId~.json',
    create_comment: 'POST/~primaryId~/~section~/~secondaryId~/comments.json',
    delete_comment: 'DELETE/~primaryId~/comments/~secondaryId~.json',
    get_documents: '/~optionalId~/documents.json',
    get_document: '/~primaryId~/documents/~secondaryId~.json',
    create_document: 'POST/~primaryId~/documents.json',
    update_document: 'PUT/~primaryId~/documents/~secondaryId~.json',
    delete_document: 'DELETE/~primaryId~/documents/~secondaryId~.json',
    get_global_events: '/events.json',
    get_project_events: '/~primaryId~/events.json',
    get_person_events: '/~primaryId~/events.json',
    get_message: '/~primaryId~/messages/~secondaryId~.json',
    create_message: 'POST/~primaryId~/messages.json',
    update_message: 'PUT/~primaryId~/messages/~secondaryId~.json',
    delete_message: 'DELETE/~primaryId~/messages/~secondaryId~.json',
    get_people: '/people.json',
    get_person: '/~primaryId~.json',
    get_person_me: '/people/me.json',
    delete_person: 'DELETE/~primaryId~.json',
    get_projects: '/projects.json',
    get_projects_archived: '/projects/archived.json',
    get_project: '/~primaryId~.json',
    create_project: 'POST/projects.json',
    update_project: 'PUT/~primaryId~.json',
    delete_project: 'DELETE/~primaryId~.json',
    get_todolists: '/~primaryId~/todolists.json',
    get_todolists_completed: '/~primaryId~/todolists/completed.json',
    get_todolists_all: '/todolists.json',
    get_todolists_all_completed: '/todolists/completed.json',
    get_todolists_with_assigned_todos: '/~primaryId~/assigned_todos.json',
    get_todolist: '/~primaryId~/todolists/~secondaryId~.json',
    create_todolist: 'POST/~primaryId~/todolists.json',
    update_todolist: 'PUT/~primaryId~/todolists/~secondaryId~.json',
    delete_todolist: 'DELETE/~primaryId~/todolists/~secondaryId~.json',
    get_todo: '/~primaryId~/todos/~secondaryId~.json',
    create_todo: 'POST/~primaryId~/todos.json',
    update_todo: 'PUT/~primaryId~/todos/~secondaryId~.json',
    delete_todo: 'DELETE/~primaryId~/todos/~secondaryId~.json',
    get_topics: '/~primaryId~/topics.json',
    get_topics_all: '/topics.json',
    create_uploads: 'POST/~primaryId~/uploads.json',
    get_upload: '~primaryId~/uploads/~secondaryId~.json'
  };

}).call(this);
