'use strict';

/**
 * collaboration_entrypoints.js — Unified Home & Notification Entrypoints for AwD & AwM
 * Integrates role-sensitive CollaborationHome and CollaborationNotifications while preserving
 * existing navigation, legacy progress panels, and security contexts.
 */
(function() {
  // ── 1. Shared Workspace Lifecycle Tracking & Task Token ───────────────────
  let _workspaceMountPromise = null;
  let _workspaceMountedProject = null;
  let _workspaceMountEpoch = 0;
  let _openTaskToken = 0;

  function hookCollaborationWorkspace() {
    if (window.CollaborationWorkspace && !window.CollaborationWorkspace._entrypointsHooked) {
      const origMount = window.CollaborationWorkspace.mount;
      const origUnmount = window.CollaborationWorkspace.unmount;
      window.CollaborationWorkspace._entrypointsHooked = true;

      window.CollaborationWorkspace.mount = function(container, options) {
        const runEpoch = ++_workspaceMountEpoch;
        _workspaceMountedProject = options?.project || null;
        const p = Promise.resolve(origMount.apply(this, arguments)).then(res => {
          if (runEpoch === _workspaceMountEpoch) {
            try {
              window.dispatchEvent(new CustomEvent('cw_workspace_mounted', {
                detail: { project: options?.project, container }
              }));
            } catch (_) {}
          }
          return res;
        });
        _workspaceMountPromise = p;
        return p;
      };

      window.CollaborationWorkspace.unmount = function() {
        _workspaceMountEpoch++;
        _workspaceMountPromise = null;
        _workspaceMountedProject = null;
        return origUnmount.apply(this, arguments);
      };
    }
  }

  // ── 2. AwD Implementation ──────────────────────────────────────────────────
  let _awdHomeTicket = 0;
  let _awdLifecycleTicket = 0;
  let _awdCurrentProject = '';
  let _awdProjectSwitching = false;
  let _awdIsAuthenticated = true;
  let _awdHooksInstalled = false;

  async function getAwdProject() {
    try {
      const res = typeof window.API?.call === 'function'
        ? await window.API.call('get_projects_bar_data')
        : (typeof window.callBackend === 'function'
            ? await window.callBackend('get_projects_bar_data')
            : (window.BrowserRuntime
                ? await window.BrowserRuntime.call('get_projects_bar_data')
                : null));
      if (!res || res.ok !== true) return null;
      return res.data?.current_project || null;
    } catch (_) {
      return null;
    }
  }

  async function awdRpc(method, args) {
    const callArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
    const res = typeof window.API?.call === 'function'
      ? await window.API.call(method, ...callArgs)
      : (typeof window.callBackend === 'function'
          ? await window.callBackend(method, ...callArgs)
          : (window.BrowserRuntime
              ? await window.BrowserRuntime.call(method, ...callArgs)
              : null));
    if (!res || res.ok !== true) {
      throw new Error(res?.error || 'Máy chủ chưa xác nhận yêu cầu.');
    }
    return res.data;
  }

  function getAwdHomePanel() {
    let panel = document.getElementById('awd-collaboration-home-panel');
    if (!panel) {
      const pageHome = document.getElementById('page-home');
      if (pageHome) {
        panel = document.createElement('div');
        panel.id = 'awd-collaboration-home-panel';
        panel.className = 'w-full mb-3';
        pageHome.prepend(panel);
      }
    }
    return panel;
  }

  async function mountAwdHome() {
    const pageHome = document.getElementById('page-home');
    if (!pageHome || !pageHome.classList.contains('active')) {
      if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();
      return;
    }

    if (_awdProjectSwitching || !_awdIsAuthenticated) return;
    const ticket = ++_awdHomeTicket;
    const panel = getAwdHomePanel();
    if (!panel || !window.CollaborationHome?.mount) return;

    try {
      const project = await getAwdProject();
      if (ticket !== _awdHomeTicket || !pageHome.classList.contains('active') || _awdProjectSwitching || !_awdIsAuthenticated) {
        return;
      }
      if (!project) {
        panel.textContent = '';
        const p = document.createElement('p');
        p.className = 'text-xs text-[#908CAA] p-3';
        p.textContent = 'Chưa có dự án được cấp quyền để tải Trang chủ.';
        panel.append(p);
        return;
      }

      _awdCurrentProject = project;
      await window.CollaborationHome.mount(panel, {
        rpc: awdRpc,
        project,
        onOpenTask: (taskId) => openAwdTask(taskId, project)
      });

      startAwdNotifications(project);
    } catch (err) {
      if (ticket === _awdHomeTicket && pageHome.classList.contains('active')) {
        panel.textContent = '';
        const errP = document.createElement('p');
        errP.className = 'text-xs text-[#E74C3C] p-3';
        errP.textContent = 'Lỗi tải dữ liệu cộng tác: ' + String(err?.message || err);
        panel.append(errP);
      }
    }
  }

  function startAwdNotifications(project) {
    if (!project || !window.CollaborationNotifications?.start || !_awdIsAuthenticated) return;
    if (window.CollaborationNotifications.isRunning()) return;

    window.CollaborationNotifications.start({
      rpc: awdRpc,
      project,
      onOpen: (parentId) => openAwdTask(parentId, project)
    });
  }

  async function openAwdTask(taskId, targetProject) {
    if (!taskId) return;
    const taskToken = ++_openTaskToken;
    if (targetProject && !_awdCurrentProject) {
      _awdCurrentProject = targetProject;
    }
    const expectedProject = targetProject || _awdCurrentProject;

    // 1. Navigate to To do
    if (typeof window.switchTopNav === 'function') {
      window.switchTopNav('todo');
    }

    // 2. Bounded await on shared workspace mount with token cancellation check
    const start = Date.now();
    const timeout = 10000;
    while (Date.now() - start < timeout) {
      if (taskToken !== _openTaskToken) {
        return; // Cancelled due to logout, project switch, or newer task request
      }

      if (_workspaceMountPromise) {
        try { await _workspaceMountPromise; } catch (_) {}
      }

      if (taskToken !== _openTaskToken) {
        return; // Cancelled while awaiting mount
      }

      const todoEl = document.getElementById('page-todo');
      const isTodoActive = todoEl?.classList.contains('active');
      const isProjMatch = _workspaceMountedProject === expectedProject && (!_awdCurrentProject || _awdCurrentProject === expectedProject);

      if (isTodoActive && isProjMatch) {
        if (typeof window.CollaborationWorkspace?.open === 'function') {
          window.CollaborationWorkspace.open(taskId);
        }
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  function initAwdHooks() {
    hookCollaborationWorkspace();
    if (_awdHooksInstalled) return;
    _awdHooksInstalled = true;
    _awdIsAuthenticated = true;
    window.addEventListener('bqlda_identity_changed', async event => {
      const ticket = ++_awdLifecycleTicket;
      ++_awdHomeTicket;
      ++_openTaskToken;
      _awdCurrentProject = '';
      _awdIsAuthenticated = !!event.detail?.username && event.detail.username !== 'guest';
      window.CollaborationHome?.unmount();
      window.CollaborationNotifications?.stop();
      window.MailShareUI?.close();
      const panel = document.getElementById('awd-collaboration-home-panel');
      if (panel) panel.textContent = '';
      if (!_awdIsAuthenticated) return;
      const project = await getAwdProject();
      if (ticket !== _awdLifecycleTicket || !_awdIsAuthenticated || !project) return;
      _awdCurrentProject = project;
      startAwdNotifications(project);
      mountAwdHome();
    });

    // Wrap switchTopNav
    if (typeof window.switchTopNav === 'function' && !window.switchTopNav._collabHooked) {
      const origSwitchTopNav = window.switchTopNav;
      const wrappedSwitchTopNav = function(navId) {
        const ret = origSwitchTopNav.apply(this, arguments);
        if (navId === 'home') {
          mountAwdHome();
        } else {
          if (window.CollaborationHome?.unmount) {
            window.CollaborationHome.unmount();
          }
        }
        return ret;
      };
      wrappedSwitchTopNav._collabHooked = true;
      window.switchTopNav = wrappedSwitchTopNav;
    }

    // Wrap HomeModule.init
    if (typeof window.HomeModule?.init === 'function' && !window.HomeModule._initHooked) {
      const origHomeInit = window.HomeModule.init;
      window.HomeModule._initHooked = true;
      window.HomeModule.init = async function() {
        const res = await origHomeInit.apply(this, arguments);
        await mountAwdHome();
        return res;
      };
    }

    // Project change events with lifecycle ticket check
    window.addEventListener('bqlda_project_changed', async (event) => {
      const detail = event?.detail || {};
      if (detail.pending || detail.state === 'switching') {
        _awdLifecycleTicket++;
        _openTaskToken++;
        _awdProjectSwitching = true;
        _awdHomeTicket++;
        if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();
        if (window.CollaborationNotifications?.stop) window.CollaborationNotifications.stop();
        if (window.MailShareUI?.close) window.MailShareUI.close();
        const panel = document.getElementById('awd-collaboration-home-panel');
        if (panel) panel.textContent = '';
      } else {
        const ticket = ++_awdLifecycleTicket;
        _awdProjectSwitching = false;
        const nextProj = await getAwdProject();
        // Discard late response if project changed again, switched, or logged out
        if (ticket !== _awdLifecycleTicket || _awdProjectSwitching || !_awdIsAuthenticated) {
          return;
        }
        if (nextProj) {
          _awdCurrentProject = nextProj;
          const pageHome = document.getElementById('page-home');
          if (pageHome?.classList.contains('active')) {
            mountAwdHome();
          }
          if (window.CollaborationNotifications && !window.CollaborationNotifications.isRunning()) {
            startAwdNotifications(nextProj);
          }
        }
      }
    });

    // Logout event: clears all state and cancels pending in-flight queries/tasks
    window.addEventListener('bqlda_logout', () => {
      _awdLifecycleTicket++;
      _openTaskToken++;
      _awdIsAuthenticated = false;
      _awdHomeTicket++;
      _awdCurrentProject = '';
      _awdProjectSwitching = false;
      if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();
      if (window.CollaborationNotifications?.stop) window.CollaborationNotifications.stop();
      if (window.MailShareUI?.close) window.MailShareUI.close();
      const panel = document.getElementById('awd-collaboration-home-panel');
      if (panel) panel.textContent = '';
    });
  }

  // ── 3. AwM Implementation ──────────────────────────────────────────────────
  let _awmObserver = null;
  let _awmCurrentProject = '';
  let _awmHomeMountedProject = '';
  let _awmActiveToken = '';
  let _awmHooksInstalled = false;

  function getAwmSessionToken() {
    try {
      return sessionStorage.getItem('awm_session') || '';
    } catch (_) {
      return '';
    }
  }

  async function mobileRpc(method, args) {
    const token = getAwmSessionToken();
    if (!token) throw new Error('Chưa đăng nhập.');
    const callArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ method, args: callArgs })
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error || 'Máy chủ từ chối yêu cầu.');
    }
    if (json.session_token) {
      try { sessionStorage.setItem('awm_session', json.session_token); } catch (_) {}
    }
    return json.data;
  }

  function getAwmProject() {
    const sel = document.getElementById('project');
    if (sel && sel.value) return sel.value;
    if (typeof window.AwmLive?.getProject === 'function') {
      const p = window.AwmLive.getProject();
      if (p) return p;
    }
    return '';
  }

  function startAwmNotifications(project) {
    if (!project || !window.CollaborationNotifications?.start) return;
    if (window.CollaborationNotifications.isRunning()) return;

    window.CollaborationNotifications.start({
      rpc: mobileRpc,
      project,
      onOpen: (parentId) => openAwmTask(parentId, project)
    });
  }

  async function openAwmTask(taskId, targetProject) {
    if (!taskId) return;
    const taskToken = ++_openTaskToken;
    const expectedProject = targetProject || getAwmProject();

    // 1. Route to To do page
    const todoBtn = document.querySelector('nav [data-page="todo"]');
    if (todoBtn && !todoBtn.disabled) {
      todoBtn.click();
    } else if (window.AwmLive?.setPage && window.AwmLive?.render) {
      window.AwmLive.setPage('todo');
      window.AwmLive.render();
    }

    // 2. Bounded await on mount with token cancellation check
    const start = Date.now();
    const timeout = 10000;
    while (Date.now() - start < timeout) {
      if (taskToken !== _openTaskToken) {
        return; // Cancelled due to logout or project switch
      }

      if (_workspaceMountPromise) {
        try { await _workspaceMountPromise; } catch (_) {}
      }

      if (taskToken !== _openTaskToken) {
        return; // Cancelled while awaiting mount
      }

      const navActive = document.querySelector('nav [data-page="todo"][aria-current="page"]');
      const curProject = getAwmProject();
      const isProjMatch = _workspaceMountedProject === expectedProject && curProject === expectedProject;

      if (navActive && isProjMatch) {
        if (typeof window.CollaborationWorkspace?.open === 'function') {
          window.CollaborationWorkspace.open(taskId);
        }
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  function handleAwmLogout() {
    _openTaskToken++;
    _awmActiveToken = '';
    _awmCurrentProject = '';
    _awmHomeMountedProject = '';
    try {
      window.dispatchEvent(new CustomEvent('bqlda_logout'));
    } catch (_) {}
    if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();
    if (window.CollaborationNotifications?.stop) window.CollaborationNotifications.stop();
    if (window.MailShareUI?.close) window.MailShareUI.close();
  }

  function checkAwmHomeState() {
    const mainEl = document.getElementById('main');
    if (!mainEl) return;

    const token = getAwmSessionToken();
    if (!token) {
      if (_awmActiveToken) handleAwmLogout();
      return;
    }
    _awmActiveToken = token;

    const project = getAwmProject();

    // Reconcile project changes directly without emitting synthetic project events
    if (project && project !== _awmCurrentProject) {
      _openTaskToken++;
      if (window.CollaborationNotifications?.stop) window.CollaborationNotifications.stop();
      if (window.MailShareUI?.close) window.MailShareUI.close();
      if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();

      _awmCurrentProject = project;
      _awmHomeMountedProject = '';

      startAwmNotifications(project);
    } else if (project) {
      startAwmNotifications(project);
    }

    const homeNav = document.querySelector('nav [data-page="home"][aria-current="page"]');
    if (!homeNav) {
      // User is not on Home -> Unmount Home
      if (window.CollaborationHome?.unmount) {
        window.CollaborationHome.unmount();
      }
      _awmHomeMountedProject = '';
      return;
    }

    // User is on Home: check panel existence AND verify panel context matches current project
    let panel = document.getElementById('awm-collaboration-home-panel');
    const panelProject = panel ? (panel.dataset?.project || (typeof panel.getAttribute === 'function' ? panel.getAttribute('data-project') : '') || '') : '';
    if (panel && panel.isConnected && panelProject === project && _awmHomeMountedProject === project) {
      return; // Active and matches current project context; prevent loop
    }

    // Stale panel context: remove and recreate
    if (panel && panelProject !== project) {
      if (window.CollaborationHome?.unmount) window.CollaborationHome.unmount();
      panel.remove();
      panel = null;
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'awm-collaboration-home-panel';
      panel.className = 'awm-collab-home-panel';
      if (!panel.dataset) panel.dataset = {};
      panel.dataset.project = project;
      if (typeof panel.setAttribute === 'function') {
        panel.setAttribute('data-project', project);
      }

      const coverSection = mainEl.querySelector('section.cover');
      if (coverSection) {
        mainEl.insertBefore(panel, coverSection);
      } else {
        mainEl.prepend(panel);
      }
    }

    _awmHomeMountedProject = project;
    if (project && window.CollaborationHome?.mount) {
      window.CollaborationHome.mount(panel, {
        rpc: mobileRpc,
        project,
        onOpenTask: (taskId) => openAwmTask(taskId, project)
      });
    }
  }

  function initAwmHooks() {
    hookCollaborationWorkspace();

    const mainEl = document.getElementById('main');
    if (!mainEl) return;

    function hookAwmLiveObject(obj) {
      if (!obj || typeof obj.selectProject !== 'function' || obj.selectProject._entrypointsHooked) {
        return;
      }
      const origSelect = obj.selectProject;
      const wrappedSelect = function(p) {
        const ret = origSelect.apply(this, arguments);
        try { checkAwmHomeState(); } catch (_) {}
        return ret;
      };
      wrappedSelect._entrypointsHooked = true;
      obj.selectProject = wrappedSelect;
    }

    if (window.AwmLive) {
      hookAwmLiveObject(window.AwmLive);
    }
    let _rawAwmLive = window.AwmLive;
    try {
      Object.defineProperty(window, 'AwmLive', {
        configurable: true,
        enumerable: true,
        get: () => _rawAwmLive,
        set: (val) => {
          _rawAwmLive = val;
          if (val) hookAwmLiveObject(val);
        }
      });
    } catch (_) {
      if (window.AwmLive) hookAwmLiveObject(window.AwmLive);
    }

    if (_awmHooksInstalled) {
      checkAwmHomeState();
      return;
    }
    _awmHooksInstalled = true;

    // Scoped child-list MutationObserver on main only
    if (!_awmObserver) {
      _awmObserver = new MutationObserver((mutations) => {
        // Guard: check if mutations are only our own panel addition
        const isSelfMutation = mutations.every(m => {
          return Array.from(m.addedNodes).some(n => n.id === 'awm-collaboration-home-panel') ||
                 Array.from(m.removedNodes).some(n => n.id === 'awm-collaboration-home-panel');
        });
        if (isSelfMutation) return;

        checkAwmHomeState();
      });

      _awmObserver.observe(mainEl, { childList: true, subtree: false });
    }

    // Listen to select#project changes
    const prjSelect = document.getElementById('project');
    if (prjSelect) {
      prjSelect.addEventListener('change', () => {
        checkAwmHomeState();
      });
    }

    // Listen to click on logout
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target && (target.id === 'logout' || target.closest?.('#logout'))) {
        handleAwmLogout();
      }
    });

    // Check initial state
    checkAwmHomeState();
  }

  // ── 4. Unified Initialization ──────────────────────────────────────────────
  function init() {
    const isAwM = !!document.querySelector('.device') ||
                  (!!document.getElementById('main') && !!document.getElementById('nav') && !document.getElementById('page-home'));
    const isAwD = !!document.getElementById('page-home') || typeof window.switchTopNav !== 'undefined';

    if (isAwD) {
      initAwdHooks();
    }
    if (isAwM) {
      initAwmHooks();
    }
  }

  window.CollaborationEntrypoints = {
    init,
    initAwdHooks,
    initAwmHooks,
    mountAwdHome,
    openAwdTask,
    openAwmTask,
    checkAwmHomeState,
    getAwdProject,
    getAwmProject,
    awdRpc,
    mobileRpc
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
