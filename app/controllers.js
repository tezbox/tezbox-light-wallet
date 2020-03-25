app
.controller('NewController', ['$scope', '$location', 'Storage', 'Lang', function($scope, $location, Storage, Lang) {
  var routeUser = function(){
    if (Storage.loaded && typeof Storage.keys.sk != 'undefined'){
        return $location.path('/main');
    } else if (Storage.loaded && typeof Storage.data.ensk != 'undefined'){
        return $location.path('/unlock');
    }
  };
  
  $scope.setting = Storage.settings;
  if (!$scope.setting) {
    $scope.setting = {
      rpc : "https://mainnet.tezrpc.me",
      language : "english",
      disclaimer : false
    };
    Storage.setSetting($scope.setting);
  } else {
    //Patch settings
    var change = false;
    if (typeof $scope.setting.language == 'undefined'){
      $scope.setting.language = "english";
      change = true;
    }
    Storage.setSetting($scope.setting);
  }
  window.eztz.node.setProvider($scope.setting.rpc);
  window.eztz.setProtocol();
  Lang.setLang($scope.setting.language);
  if ($scope.setting.disclaimer) {
    routeUser();
  }
  $scope.acceptDisclaimer = function(){
    $scope.setting.disclaimer = true;
    Storage.setSetting($scope.setting);
    routeUser();
  };
  $scope.unacceptDisclaimer = function(){
    $scope.setting.disclaimer = false;
    Storage.setSetting($scope.setting);
  };
  $scope.restore = function(){
    return $location.path('/restore');
  };
  $scope.link = function(){
    return $location.path('/link');
  };
  $scope.create = function(){
    return $location.path('/create');
  };
}])
.controller('CreateController', ['$scope', '$location', 'Storage', '$sce', function($scope, $location, Storage, $sce) {
  $scope.passphrase = '';
  $scope.mnemonic = '';
  $scope.cancel = function(){
    if (Storage.keys.length == 0){
      return $location.path('/new');
    } else {
      return $location.path('/main');
    }
  };
  $scope.newMnemonic = function(){
   $scope.mnemonic = window.eztz.crypto.generateMnemonic();
  }
  $scope.showSeed = function(m){
    var mm = m.split(" ");
    return $sce.trustAsHtml("<span>"+mm.join("</span> <span>")+"</span>");
  }
  $scope.create = function(){
    var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase);
    keys = {sk : keys.sk, pk : keys.pk, pkh : keys.pkh, type : "encrypted"};
    var identity = {
      pkh : keys.pkh,
      accounts : [{title: "Manager " + (Storage.keys.length+1), address : keys.pkh, public_key : keys.pk}],
      account : 0
    };
    Storage.newAccount(identity, keys);
    return $location.path("/validate");
  };
  
  $scope.newMnemonic();
}])
.controller('ValidateController', ['$scope', '$location', 'Storage', '$sce', 'SweetAlert', 'Lang', function($scope, $location, Storage, $sce, SweetAlert, Lang) {
  var ss = Storage.data;
  if (!Storage.newKey){
    return $location.path('/new');
  }

  $scope.passphrase = '';
  $scope.mnemonic = '';
  
  $scope.cancel = function(){
    Storage.clearNewAccount();
    if (Storage.keys.length == 0){
      return $location.path('/new');
    } else {
      return $location.path('/main');
    }
  };  
  $scope.validate = function(){
    var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase);
    if (!Storage.checkNewPkh(keys.pkh)) {
      SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('details_dont_match'), 'error');
    } else {
      Storage.addNewAccount();
      ss = Storage.data;
      if (Storage.keys.length <= 1){
        return $location.path("/encrypt");
      } else {
        window.showLoader();
        setTimeout(function(){
          $scope.$apply(function(){
            ss.ensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync(Storage.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));;
            Storage.setStore(ss);
            return $location.path("/main");
          });
        }, 100);
      }
    }
  };
}])
.controller('MainController', ['$scope', '$location', '$http', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, $http, Storage, SweetAlert, Lang) {
  var ss = Storage.data, protos = {
    "ProtoALp" : "Alpha",
    "PtCJ7pwo" : "Betanet_v1",
    "PsYLVpVv" : "Mainnet",
    "PsddFKi3" : "Mainnet_V2",
    "Pt24m4xi" : "Athens",
    "PsBabyM1" : "Babylon 2",
    "PsCARTHA" : "Carthage",
  }, 
	networks = {
		"NetXdQprcVkpaWU" : "Mainnet",
		"NetXKakFj1A7ouL" : "Zeronet",
		"NetXgtSLGNJvNye" : "Alphanet",
	};
  $scope.currentProto = '';
  if (!ss || !ss.ensk || Storage.keys.length == 0){
     return $location.path('/new');
  }
    $scope.version = window.TEZBOX_VERSION;

  $scope.currentAccount = ss.account;
  $scope.mainAccounts = ss.accounts;
	$scope.isRevealed = false;
  $scope.type = Storage.keys[ss.account].type;
  
  $scope.hd_path = '';
  if ($scope.type == "ledger" || $scope.type == "trezor"){
    $scope.hd_path = Storage.keys[$scope.currentAccount].sk;
  }
  $scope.setting = Storage.loadSetting();
  $scope.accounts = ss.accounts[ss.account].accounts;
  $scope.account = ss.accounts[ss.account].account;
  $scope.accountLive = true;
  $scope.accountDetails = {};
  $scope.tt = $scope.accounts[$scope.account].title;
  $scope.transactions = [];
  $scope.amount = 0;
  $scope.fee = 2500;
  $scope.customFee = 2500;
  $scope.advancedOptions = false;
  $scope.gas_limit = 18000;
  $scope.storage_limit = 300;
  $scope.parameters = '';
  $scope.delegateType = 'undelegated';
  $scope.advancedOptions = false;
  $scope.showCustom = false;
  $scope.showAccounts = false;
  $scope.dd = '';
  $scope.moreTxs = false;
  $scope.block = {
    net : "Loading..",
    level : "N/A",
    proto : "Loading",
  };
  $scope.kt1 = '';
  $scope.delegates = {
    keys : [
    'false',
    'tz1P2Po7YM526ughEsRbY4oR9zaUPDZjxFrb',
    'tz1QLXqnfN51dkjeghXvKHkJfhvGiM5gK4tc',
    'tz1d6Fx42mYgVFnHUW8T8A7WBfJ6nD9pVok8',
    'tz1cX93Q3KsiTADpCC4f12TBvAmS5tw7CW19',
    'tz1Zhv3RkfU2pHrmaiDyxp7kFZpZrUCu1CiF',
    'tz1ZQppA6UerMz5CJtGvZmmB6z8L9syq7ixu',
    'tz1LmaFsWRkjr7QMCx5PtV6xTUz3AmEpKQiF',
    'tz1Ryat7ZuRapjGUgsPym9DuMGrTYYyDBJoq',
    'tz1iJ4qgGTzyhaYEzd1RnC6duEkLBd1nzexh',
    'tz1Scdr2HsZiQjc7bHMeBbmDRXYVvdhjJbBh',
    'tz1WCd2jm4uSt4vntk4vSuUWoZQGhLcDuR9q',
    'tz1RV1MBbZMR68tacosb7Mwj6LkbPSUS1er1',
    ],
    names : [
      'Undelegated',
      'P2P Validator',
      'Fresh Tezos',
      'My Tezos Baking',
      'Tz Bakery',
      'TZ Bake',
      'First Block',
      'Blockpower',
      'Illuminarean',
      'Tz Envoy',
      'Figment',
      'HappyTezos',
      'Baking Tacos',
    ]
  };
  $scope.privateKey = '';
  $scope.password = '';
  $scope.getBlocky = function(a){
		return "0" + window.eztz.utility.b582int(a);
	}
	
  var setBalance = function(r){
    var rb = parseInt(r);
    var bal = $scope.toTez(rb); 
    $scope.accountDetails.raw_balance = rb;
    $scope.accountDetails.balance = window.eztz.utility.formatMoney(bal, 2, '.', ',')+"ꜩ";
    //TODO: integrate with currencies
    var usdbal = bal * 1.37;
    $scope.accountDetails.usd = "$"+window.eztz.utility.formatMoney(usdbal, 2, '.', ',')+"USD";
  }
  var refreshTransactions = function(){
    var maxTxs = 20;
    //$http.get("https://api1.tzscan.io/v1/operations/"+$scope.accounts[$scope.account].address+"?type=Transaction&p=0&number="+ (maxTxs+1)).then(function(r){
    //$http.get("https://tzsimple.tulip.tools/v3/operations/"+$scope.accounts[0].address+"?type=transaction").then(function(r){

    $http.get("https://mystique.tzkt.io/v3/operations/"+$scope.accounts[$scope.account].address+"?type=Transaction").then(function(r){
      if (r.status == 200 && r.data.length > 0){
        if (r.data.length > maxTxs) {
          r.data = r.data.slice(-maxTxs);
          $scope.moreTxs = true;
        } else {
          $scope.moreTxs = false;
        }
        r.data = r.data.reverse();
        var txs = [];
        for(var i = 0; i < r.data.length; i++){
          for(var j = 0; j < r.data[i].type.operations.length; j++){
            if (r.data[i].type.operations[j].kind != 'transaction' || r.data[i].type.operations[j].failed) continue;
            txs.push({
              "amount" : r.data[i].type.operations[j].amount,
              "fee" : r.data[i].type.operations[j].fee,
              "destination" : r.data[i].type.operations[j].destination.tz,
              "hash" : r.data[i].hash,
              "source" : r.data[i].type.operations[j].src.tz,
              "time" : r.data[i].type.operations[j].timestamp,
              "operationHash" : r.data[i].hash,
            });
          }
        }
        $scope.transactions = txs;
      }
    });
  };
  var refreshHash = function(){
    window.eztz.rpc.getHead().then(function(r){
      $scope.$apply(function(){
				if (typeof networks[r.chain_id] != 'undefined') {
					net = Lang.translate("connected_to") + " " + networks[r.chain_id];
				} else {
					net = Lang.translate("unknown_network") + " (" + r.chain_id + ")";
				}
        $scope.currentProto = r.protocol.substr(0,8);
        if (window.eztz.getProtocol().substr(0,8) != $scope.currentProto){
          console.log("PROTOCOL CHANGED TO " + $scope.currentProto);
          window.eztz.setProtocol();
        }
        $scope.currentProto
        $scope.block = {
          net : net,
          net : r.chain_id,
          level : r.header.level,
          proto : Lang.translate("connected_to") + " " + (typeof protos[$scope.currentProto] != 'undefined' ? protos[$scope.currentProto] : $scope.currentProto),
        };
      });
    }).catch(function(e){
      $scope.$apply(function(){
        $scope.block = {
          net : "Error",
          level : "N/A",
          proto : Lang.translate("not_connected"),
        };
      });
    });
  }
  var refreshAll = function(){
    refreshHash();
    refreshTransactions();
		refreshBalance();
  }
  var refreshBalance = function(){
		if (!$scope.isRevealed){
			window.eztz.node.query('/chains/main/blocks/head/context/contracts/' + $scope.accounts[0].address + '/manager_key').then(function(r){
        if ($scope.currentProto == 'PsCARTHA'){
          if (r == Storage.keys[$scope.currentAccount].pk) $scope.isRevealed = true;
        } else {
          if (r.key == Storage.keys[$scope.currentAccount].pk) $scope.isRevealed = true;
        }
			});
		}
		window.eztz.rpc.getBalance($scope.accounts[$scope.account].address).then(function(r){
      $scope.$apply(function(){
        $scope.accountLive = true;
        setBalance(r);
      });
    }).catch(function(e){
      $scope.$apply(function(){
        $scope.accountLive = false;
        setBalance(0);
      });
    });
	}
	var remoteSign = function(t, op){
    switch(t){
      case "ledger":
        op = op.then(function(r){
          SweetAlert.swal({
            title: '',
            imageUrl: "skin/images/ledger-logo.svg",
            text: Lang.translate('ledger_confirm_transaction'),
            showCancelButton: true,
            showConfirmButton: false,
          }, function(c){
            if (!c) {
              window.hideLoader();
              cancelled = true;
            }
          });
          return window.tezledger.sign(Storage.keys[$scope.currentAccount].sk, "03"+r.opbytes).then(function(rr){
            r.opOb.signature = window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(rr.signature), window.eztz.prefix.edsig);
            if (!cancelled) return window.eztz.rpc.inject(r.opOb, r.opbytes + rr.signature);
          });
        })
      break;
      case "trezor":
        var cancelled = false;
        op = op.then(function(r){
          return new Promise(function(resolve, reject){
            SweetAlert.swal({
              title: '',
              imageUrl: "skin/images/trezor-logo.svg",
              text: "Are you sure you want to connect to your Trezor device?",
              showCancelButton: true,
              showConfirmButton: true,
            }, function(c){
              if (c){
                SweetAlert.swal({
                  title: '',
                  imageUrl: "skin/images/trezor-logo.svg",
                  text: Lang.translate('trezor_confirm_transaction'),
                  showCancelButton: true,
                  showConfirmButton: false,
                }, function(c){
                  if (!c) {
                    window.hideLoader();
                    cancelled = true;
                    reject();
                  }
                });
                var tops = eztz.trezor.operation(r);
                window.teztrezor.sign(Storage.keys[$scope.currentAccount].sk, eztz.utility.b58cdecode(r.opOb.branch, eztz.prefix.b), tops[0], tops[1]).then(function(rr){
                  r.opOb.signature = rr.signature;
                  if (!cancelled){
                    resolve(window.eztz.rpc.inject(r.opOb, eztz.utility.buf2hex(rr.sigOpContents)));      
                  } else reject()                        
                }).catch(reject);
              } else {
                cancelled = true;
                window.hideLoader();
                reject();
              }
            });
          });
        })
      break;
      case "offline":
      default:
        window.hideLoader();
        SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_undeveloped'), 'error')
        return;
      break;
    }
    return op;
  }
	
  $scope.showPrivatekey = function(){
    if (!$scope.password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('please_enter_password'), 'error');
    if ($scope.password == Storage.password) {
      $scope.privateKey = Storage.keys[$scope.currentAccount].sk;
    } else { 
      SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('incorrect_password'), 'error');
    }
		$scope.password = '';
  }
  $scope.nextAddress = function(){
    if ($scope.accounts.length === 1) return $scope.accounts[0].address;
    else return ($scope.account === 0 ? $scope.accounts[1].address : $scope.accounts[0].address);
  }
  $scope.max = function(){
    var max = $scope.accountDetails.raw_balance;
    var fee = ($scope.showCustom ? $scope.customFee : $scope.fee);
    return Math.max($scope.toTez(max - fee), 0);
  }
  $scope.toDate = function(d){
    var myDate = new Date(d), date = myDate.getDate(), month = myDate.getMonth(), year = myDate.getFullYear(), hours = myDate.getHours(), minutes = myDate.getMinutes();
    function pad(n) {
      return n<10 ? '0'+n : n
    }
    return pad(date) + "-" + pad(month + 1) + "-" + year + " " + pad(hours) + ":" + pad(minutes);
  }
  $scope.toTez = function(m){
    return window.eztz.utility.totez(parseInt(m));
  }
  $scope.viewSettings = function(){
      clearInterval(ct);
      return $location.path('/setting');
  }
  $scope.lock = function(){
      clearInterval(ct);
      Storage.keys = [];
      return $location.path('/unlock');
  } 
  $scope.saveTitle = function(){
    if (!$scope.tt){
        SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_new_title'), 'error');
        return;
    }
    $scope.accounts[$scope.account].title = $scope.tt;
    $scope.mainAccounts[$scope.currentAccount].accounts = $scope.accounts;
    ss.accounts = $scope.mainAccounts;
    Storage.setStore(ss);
    $scope.refresh();
  };   
    
  $scope.sideTog = function(){
    window.toggleSide();
  }
  $scope.import = function(){
    if (!$scope.kt1) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_kt1_address'), 'error');

    window.showLoader();
    
    window.eztz.node.query("/chains/main/blocks/head/context/contracts/"+$scope.kt1).then(function(r){
      r = r.script.storage.string;
      if (r != $scope.accounts[0].address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_kt1_manager'), 'error');
      $scope.$apply(function(){
        $scope.accounts.push(
          {
            title : "Account " + ($scope.accounts.length),
            address : $scope.kt1
          }
        );
        $scope.account = ($scope.accounts.length-1);
        $scope.mainAccounts[$scope.currentAccount].account = $scope.account;
        $scope.mainAccounts[$scope.currentAccount].accounts = $scope.accounts;
        ss.accounts = $scope.mainAccounts;
        Storage.setStore(ss);
        $scope.refresh();
        $scope.kt1 = '';
        window.hideLoader();
      })
      return true;
    })
  };   
  $scope.remove = function(){
    if ($scope.account === 0) {
      if ($scope.mainAccounts.length <= 1) {
        SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('last_account_error'), 'error');
      } else {
        SweetAlert.swal({
          title: Lang.translate('are_you_sure'),
          text: Lang.translate('remove_account_warning'),
          type : "warning",
          showCancelButton: true,
          confirmButtonText: Lang.translate('yes_remove_it'),
          closeOnConfirm: true
        },
        function(isConfirm){
          if (isConfirm){
            $scope.mainAccounts.splice($scope.currentAccount, 1);
            $scope.currentAccount = 0;
            ss.accounts = $scope.mainAccounts;
            ss.account = $scope.currentAccount;
            Storage.setStore(ss);
            $scope.refresh();
          }
        });
      }
    } else {
      
      SweetAlert.swal({
        title: Lang.translate('are_you_sure'),
        text: Lang.translate('remove_conract_warning'),
        type : "warning",
        showCancelButton: true,
        confirmButtonText: Lang.translate('yes_remove_it'),
        closeOnConfirm: true
      },
      function(isConfirm){
        if (isConfirm){
          $scope.accounts.splice($scope.account, 1);
          $scope.account = 0;
          $scope.mainAccounts[$scope.currentAccount].accounts = $scope.accounts;
          $scope.mainAccounts[$scope.currentAccount].account = $scope.account;
          ss.accounts = $scope.mainAccounts;
          Storage.setStore(ss);
          $scope.refresh();
        }
      });
    }
  };
  $scope.loadManager = function(a){
    $scope.currentAccount = a;
    $scope.transactions = [];
    ss.account = $scope.currentAccount;
    $scope.accounts = ss.accounts[ss.account].accounts;
    $scope.account = ss.accounts[ss.account].account;
    $scope.tt = $scope.accounts[$scope.account].title;;
    $scope.type = Storage.keys[$scope.currentAccount].type;
    if ($scope.type == "ledger" || $scope.type == "trezor"){
      $scope.hd_path = Storage.keys[$scope.currentAccount].sk;
    }
    Storage.setStore(ss);
    $scope.accountDetails = {
        balance : Lang.translate('loading'),
        usd : Lang.translate('loading'),
        raw_balance : Lang.translate('loading'),
    };
    $scope.delegateType = 'undelegated';
    $scope.dd = '';
    window.eztz.rpc.getDelegate($scope.accounts[$scope.account].address).then(function(r){
      $scope.$apply(function(){
        $scope.dd = r;
        if ($scope.delegates.keys.indexOf($scope.dd) >= 0){
          $scope.delegateType = $scope.dd;
        } else if (!$scope.dd){
          $scope.delegateType = 'undelegated';
          $scope.dd = '';
        } else
          $scope.delegateType = '';
      });
    }).catch();
    refreshTransactions();
    refreshBalance();
  }
  $scope.loadAccount = function(a){
    $scope.account = a;
    $scope.transactions = [];
    ss.accounts[$scope.currentAccount].account = $scope.account
    $scope.tt = $scope.accounts[$scope.account].title;;
    Storage.setStore(ss);
    $scope.accountDetails = {
        balance : Lang.translate('loading'),
        usd : Lang.translate('loading'),
        raw_balance : Lang.translate('loading'),
    };
    if ($scope.account == 0){
      window.eztz.rpc.getDelegate($scope.accounts[$scope.account].address).then(function(r){
        $scope.$apply(function(){
          $scope.dd = r;
          if ($scope.delegates.keys.indexOf($scope.dd) >= 0){
            $scope.delegateType = $scope.dd;
          } else if (!$scope.dd){
            $scope.delegateType = 'undelegated';
            $scope.dd = '';
          } else
            $scope.delegateType = '';
        });
      });
    }
    refreshTransactions();
    refreshBalance();
  }
  $scope.refresh = function(){
      $scope.loadAccount($scope.account);
  };
  $scope.copy = function(){
    SweetAlert.swal(Lang.translate('awesome'), Lang.translate('copy_clipboard'), "success");
    window.copyToClipboard($scope.accounts[$scope.account].address);
  };
  $scope.clear = function(){
    $scope.amount = 0;
    $scope.customFee = 2500;
    $scope.fee = 2500;
    $scope.toaddress = '';
    $scope.parameters = '';
    $scope.showAccounts = false;
  }
  
	
	function checkAddress(a){
		return new Promise(function(resolve, reject){
			if (a.substr(0,2) == "tz") {
				window.showLoader();
				window.eztz.rpc.getBalance(a).then(function(b){
					window.hideLoader();
					if (b == 0){
						SweetAlert.swal({
							title: Lang.translate('extra_fee'),
							text: Lang.translate('transaction_confirm_lowtz'),
							showCancelButton: true,
							confirmButtonText: Lang.translate('confirm'),
							closeOnConfirm: true
						},
						function(isConfirm){
							if (isConfirm){
                var rem = ($scope.max() - $scope.amount);
                if (rem < 0.257) $scope.amount = Math.floor(($scope.amount *1000000) - 257000)/1000000;
								resolve();
							}
						});
					} else {
						resolve();
					}
				}).catch(function(e){
					resolve();
					window.hideLoader();
				});
			} else {
				resolve();
			}
		});
	}
  //on-chain functions
  $scope.send = function(){
    var ktsend = false;
    if ($scope.accounts[$scope.account].address.substr(0,1) == "K") {
      var ktsend = true;      
    }
    var fee = ($scope.showCustom ? $scope.customFee : $scope.fee);
    if (!$scope.toaddress || ($scope.toaddress.substring(0, 2) !=  "tz" && $scope.toaddress.substring(0, 3) !=  "KT1")) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_valid_destinaton'), 'error');
    if ($scope.toaddress == $scope.accounts[$scope.account].address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_send_self'));
    if ($scope.amount < 0) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_positive_amount'), 'error');
    if ($scope.amount > $scope.max()) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_amount_exceeds'), 'error');
    if (fee < 0) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_positive_fee'));
    if ($scope.amount != parseFloat($scope.amount)) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_invalid_amount'), 'error');
    if (fee != parseInt(fee)) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_invalid_fee'), 'error');
    
    var sendParams = false;
    if (!ktsend){
      if (!$scope.isRevealed && fee < 2689) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('first_operation'), 'error');
      if ($scope.parameters){
        sendParams = $scope.parameters;
      }
    } else {
       if ($scope.parameters) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_param_send'), 'error');
       sendParams = window.managerOps.transfer($scope.toaddress, $scope.amount);
    }
    
		var check = checkAddress($scope.toaddress);
		check.then(function(){
			SweetAlert.swal({
				title: Lang.translate('are_you_sure'),
				text: Lang.translate('transaction_confirm_info', [$scope.amount, $scope.toaddress]),
				type : "warning",
				showCancelButton: true,
				confirmButtonText: Lang.translate('yes_send_it'),
				closeOnConfirm: true
			},
			function(isConfirm){
				if (isConfirm){
					window.showLoader();
					var keys = {
						sk : Storage.keys[$scope.currentAccount].sk,
						pk : Storage.keys[$scope.currentAccount].pk,
						pkh : Storage.keys[$scope.currentAccount].pk
					};
					if ($scope.type != "encrypted") keys.sk = false;
          
          if (!ktsend){
            var op = window.eztz.rpc.transfer($scope.accounts[$scope.account].address, keys, $scope.toaddress, $scope.amount, fee, sendParams, $scope.gas_limit, $scope.storage_limit, 0);
          } else {
            var op = window.eztz.rpc.transfer($scope.accounts[0].address, keys, $scope.accounts[$scope.account].address, 0, fee, sendParams, $scope.gas_limit, $scope.storage_limit, 0);
          }
					
					var cancelled = false;
					if ($scope.type != "encrypted"){
						op = remoteSign($scope.type, op);
					}
					
					op.then(function(r){
						$scope.$apply(function(){
							window.hideLoader();
							if (!cancelled){
								SweetAlert.swal(Lang.translate('awesome'), Lang.translate('transaction_sent'), "success");
								refreshTransactions();
								$scope.clear();
							}
						});
					}).catch(function(r){
            console.log("SEND ERROR", r);
						$scope.$apply(function(){
							if (!cancelled){
								window.hideLoader();
								if (window.isJsonString(r)){
									r = JSON.parse(r);
									SweetAlert.swal(Lang.translate('uh_oh'), r[0].error, 'error');
								} else if (typeof r.name != 'undefined'){
									SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed') + " " + "Hardware device error", 'error');
								} else if (r == "TREZOR_ERROR") {
									SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed') + " " + "Trezor device error", 'error');
								} else if (typeof r.errors != 'undefined'){
									ee = r.errors[0].id.substr(19);//split(".").pop();
									SweetAlert.swal(Lang.translate('uh_oh'), r.error + ": " + ee, 'error');
								} else if (typeof r == 'string') {
									SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed') + " - " + r, 'error');
								} else {
									SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed2'), 'error');
								}
							}
						});
					});
				}
			});
		});
	};
  $scope.updateDelegate = function(){
      var fee = ($scope.showCustom ? $scope.customFee : $scope.fee);
      if (fee < 0) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_positive_fee'), 'error');
      if (fee != parseInt(fee)) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_invalid_fee'), 'error');
      var delegate;
      if ($scope.delegateType == "undelegated") delegate = "";
      else {
        if ($scope.delegateType) $scope.dd = $scope.delegateType;
        if (!$scope.dd) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_valid_delegate'), 'error');
        delegate = $scope.dd;
      }
      
      window.showLoader();
      var keys = {
        sk : Storage.keys[$scope.currentAccount].sk,
        pk : Storage.keys[$scope.currentAccount].pk,
        pkh : $scope.accounts[$scope.account].address,
      };
      if ($scope.type != "encrypted") keys.sk = false;
      var op = window.eztz.rpc.setDelegate($scope.accounts[$scope.account].address, keys, delegate, fee);
        
      var cancelled = false;
      if ($scope.type != "encrypted"){
        op = remoteSign($scope.type, op);
      }
      
      op.then(function(r){
        $scope.$apply(function(){
          window.hideLoader();
          if (!cancelled){
            SweetAlert.swal(Lang.translate('awesome'), Lang.translate('delegation_success'), "success");
            $scope.fee = 2500;
          }
        });
      }).catch(function(r){
        $scope.$apply(function(){
          if (!cancelled){
            window.hideLoader();
            if (typeof r.name != 'undefined'){
              SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed') + " " + "Hardware device error", 'error');
            } else if (r == "TREZOR_ERROR") {
              SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('operation_failed') + " " + "Trezor device error", 'error');
            } else {
              SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('delegation_failed'), 'error');
            }
          }
        });
      });
  }
  $scope.createManager = function(){
    return $location.path('/create');
  };
  $scope.restoreManager = function(){
    return $location.path('/restore');
    
  };
  $scope.linkManager = function(){
    return $location.path('/link');
  };
  $scope.add = function(){
    if ($scope.currentProto == 'PsCARTHA') {
      return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_baby_originate'), 'error');
    } else {
      SweetAlert.swal({
        title: Lang.translate('are_you_sure'),
        text: Lang.translate('originate_warning'),
        type : "warning",
        showCancelButton: true,
        confirmButtonText: Lang.translate('yes_continue'),
        closeOnConfirm: true
      },
      function(isConfirm){
        if (isConfirm){
          window.showLoader();
          var keys = {
            sk : Storage.keys[$scope.currentAccount].sk,
            pk : Storage.keys[$scope.currentAccount].pk,
            pkh : $scope.accounts[0].address,
          };
          if ($scope.type != "encrypted") keys.sk = false;
          var op = window.eztz.rpc.account(keys, 0, true, true, false, 1731)
          
          var cancelled = false;
          if ($scope.type != "encrypted"){
            op = remoteSign($scope.type, op);
          }
          
          op.then(function(r){
            $scope.$apply(function(){
              var address = window.eztz.contract.hash(r.hash, 0);
              if ($scope.accounts[$scope.accounts.length-1].address != address){
                $scope.accounts.push(
                  {
                    title : "Contract " + ($scope.accounts.length),
                    address : address
                  }
                );
                $scope.account = ($scope.accounts.length-1);
                $scope.mainAccounts[$scope.currentAccount].accounts = $scope.accounts;
                $scope.mainAccounts[$scope.currentAccount].account = $scope.account;
                ss.accounts = $scope.mainAccounts;
                Storage.setStore(ss);
                SweetAlert.swal(Lang.translate('awesome'), Lang.translate('new_account_originated'), "success");
              } else {
                SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_origination_awaiting'), 'error');
              }
              $scope.refresh();
              window.hideLoader();
            });
          }).catch(function(r){
            window.hideLoader();
            if (typeof r.errors !== 'undefined'){
              ee = r.errors[0].id.split(".").pop();
              SweetAlert.swal(Lang.translate('uh_oh'), r.error + ": Error (" + ee + ")", 'error');
            } else SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('origination_error'), 'error');
          });
        }
      });
    }
  };
  
  //init
  if (Storage.restored){
    window.showLoader();
    //$http.get("https://api1.tzscan.io/v1/operations/"+$scope.accounts[0].address+"?type=Origination").then(function(r){
    $http.get("https://tzsimple.tulip.tools/v3/operations/"+$scope.accounts[0].address+"?type=origination").then(function(r){
    //$http.get("https://mystique.tzkt.io/v1/operations/"+$scope.accounts[0].address+"?type=Origination").then(function(r){
      window.hideLoader();
      if (r.status == 200 && r.data.length > 0){
        SweetAlert.swal({
          title: Lang.translate('import_kt_address'),
          text: Lang.translate('import_kt_address_info', [r.data.length]),
          type : "info",
          showCancelButton: true,
          confirmButtonText: Lang.translate('yes_import_them'),
          closeOnConfirm: true
        },
        function(isConfirm){
          if (isConfirm){
            for(var i = 0; i < r.data.length; i++){
              for(var j = 0; j < r.data[i].type.operations.length; j++){
                $scope.accounts.push(
                  {
                    title : "Contract " + ($scope.accounts.length),
                    address : eztz.contract.hash(r.data[i].hash, 0)
                  }
                );
              }
            }
            $scope.mainAccounts[$scope.currentAccount].accounts = $scope.accounts;
            ss.accounts = $scope.mainAccounts;
            Storage.setStore(ss);
            $scope.refresh();
          }
        });
      }
    }).catch(function(e){
			window.hideLoader();
		});
    
    if (Storage.ico) SweetAlert.swal(Lang.translate('awesome'), Lang.translate('ico_restore_success'), 'success');
    Storage.restored = false;
    Storage.ico = false;
  } else {
    window.hideLoader();
  }
  $scope.refresh();
  refreshAll();
  var ct = setInterval(function(){
		$scope.$apply(function(){
			refreshAll();
		});
	}, 20000);
}])
.controller('SettingController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.setting = Storage.settings;
  
  $scope.save = function(){
    Storage.setSetting($scope.setting);
    window.eztz.node.setProvider($scope.setting.rpc);
    window.eztz.setProtocol();
    return $location.path('/main');
  }
  
}])
.controller('UnlockController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  var ss = Storage.data;
  $scope.password = '';
  $scope.clear = function(){
    SweetAlert.swal({
      title: Lang.translate('are_you_sure'),
      text: Lang.translate('clear_tezbox_warning'),
      type : "warning",
      showCancelButton: true,
      confirmButtonText: Lang.translate('yes_clear_it'),
      closeOnConfirm: true
    },
    function(isConfirm){
      if (isConfirm){
        Storage.clearStore();
        return $location.path('/new');
      }
    });
  }
  $scope.unlock = function(){
    if (!$scope.password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('please_enter_password'), 'error');
    window.showLoader();
    setTimeout(function(){
      $scope.$apply(function(){
        try {
          var sk = sjcl.decrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, ss.accounts[0].pkh, 30000, 512, 'sha512').toString(), ss.ensk);
          if (typeof ss.oldEnsk != 'undefined'){
            //Legacy
            var type = sk.substr(0,4);
            if (type == "edsk") { 
              var c = window.eztz.crypto.extractKeys(sk);			
              c.type = "encrypted";		
            } else {
              var c = {
                pk : ss.accounts[0].public_key,
                pkh : ss.pkh,
                sk : sk.substr(4),
              };
              if (type == "ledg"){
                c.type = "ledger";
              } else if (type == "trez"){
                c.type = "trezor";
              } else if (type == "offl"){
                c.type = "offline";
              } else {
                //Legacy
                c.type = "ledger";
                c.sk = sk;
              }
            }
            Storage.keys = [c];
            //Update storage
            var newensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));
            delete ss.oldEnsk;
            ss.ensk = newensk;
            Storage.setStore(ss);
          } else {
            var keys = JSON.parse(atob(sk));
            console.log(keys);
            Storage.keys = keys;
          }
        } catch(err){
          window.hideLoader();
          SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('incorrect_password'), 'error');
          return;
        }
        Storage.password = $scope.password;
        return $location.path('/main');
      });
    }, 100);
  };
}])
.controller('EncryptController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  var ss = Storage.data;
  if (Storage.keys.length !== 1) return $location.path('/new');
  $scope.password = '';
  $scope.password2 = '';
  
  $scope.encrypt = function(){
    if (!$scope.password || !$scope.password2) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_password'), 'error');
    if ($scope.password.length < 8) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_short'), 'error');
    if ($scope.password != $scope.password2) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_dont_match'), 'error');
    var spaces = $scope.password.match(/\s+/g),
    numbers = $scope.password.match(/\d+/g),
    uppers  = $scope.password.match(/[A-Z]/),
    lowers  = $scope.password.match(/[a-z]/),
    special = $scope.password.match(/[!@#$%\^&*\+]/);

    if (spaces !== null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_spaces'), 'error');
    if (uppers === null || lowers === null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_upper_lower'), 'error');
    if (special === null && numbers === null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_special'), 'error');
    
    window.showLoader();
    setTimeout(function(){
      $scope.$apply(function(){
        ss.ensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));
        Storage.setStore(ss);
        Storage.password = $scope.password;            
        return $location.path("/main");
      });
    }, 100);
  }
  $scope.cancel = function(){
    Storage.clearStore();
    return $location.path('/new');
  };
  
}])
.controller('LinkController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.type = 'ledger'; //ledger/trezor/offline
  $scope.address = '';
  $scope.data = "44'/1729'/0'/0'";
  
  $scope.cancel = function(){
    if (Storage.keys.length == 0){
      return $location.path('/new');
    } else {
      return $location.path('/main');
    }
  };
  $scope.link = function(){

    if ($scope.type == 'ledger' && !$scope.data) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_path_ledger'), 'error');
    if ($scope.type == 'trezor' && !$scope.data) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_path_trezor'), 'error');
    if ($scope.type == 'offline' && !$scope.address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_offline_address'), 'error');
        
    $scope.text = Lang.translate('linking');
    var cancelled = false;
    if ($scope.type == 'ledger'){
      SweetAlert.swal({
        title: '',
        imageUrl: "skin/images/ledger-logo.svg",
        text: Lang.translate('ledger_verify_address'),
        showCancelButton: true,
        showConfirmButton: false,
      }, function(c){
        if (!c){
          cancelled = true;
          window.hideLoader();              
        }
      });
      window.showLoader();
      var pp = window.tezledger.getAddress($scope.data).then(function(r){
        return window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(r.publicKey.substr(2)), window.eztz.prefix.edpk)
      })
    } else if ($scope.type == 'trezor'){
      SweetAlert.swal({
        title: '',
        imageUrl: "skin/images/trezor-logo.svg",
        text: Lang.translate('trezor_verify_address'),
        showCancelButton: true,
        showConfirmButton: false,
      }, function(c){
        if (!c){
          cancelled = true;
          window.hideLoader();              
        }
      });
      window.showLoader();
      var pp = window.teztrezor.getAddress($scope.data).then(function(r){
        return r.publicKey;
      })
    }
    pp.then(function(pk){
      $scope.$apply(function(){
        address = window.eztz.utility.b58cencode(window.eztz.library.sodium.crypto_generichash(20, window.eztz.utility.b58cdecode(pk, window.eztz.prefix.edpk)), window.eztz.prefix.tz1)
        SweetAlert.swal(Lang.translate('awesome'), Lang.translate('ledger_retreived_address') + ": "+address+"!", "success");
        var identity = {
            pkh : address,
            accounts : [{title: "Manager " + (Storage.keys.length+1), address :address, public_key : pk}],
            account : 0
        };
        Storage.restored = true;
        Storage.addNewAccount(identity, {
          pk : pk,
          pkh : address,
          sk : $scope.data,
          type : $scope.type
        });
        
        ss = Storage.data;
        if (Storage.keys.length <= 1){
          window.hideLoader();
          return $location.path("/encrypt");
        } else {
          setTimeout(function(){
            $scope.$apply(function(){
              ss.ensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync(Storage.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));;
              Storage.setStore(ss);
              return $location.path("/main");
            });
          }, 100);
        }
      });
    }).catch(function(e){
      if (cancelled) return;
      window.hideLoader();
      if ($scope.type == 'trezor'){
        SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('trezor_error_connect'), 'error');
      } else if ($scope.type == 'trezor'){
        SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('ledger_error_connect'), 'error');
      }
    });    
  };
}])
.controller('RestoreController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.type = 'ico';
  $scope.seed = '';
  $scope.passphrase = '';
  $scope.private_key = '';
  $scope.encryption_password = '';
  $scope.email = '';
  $scope.ico_password = '';
  $scope.activation_code = '';
  $scope.link = function(){
    return $location.path('/link');
  };
  $scope.cancel = function(){
    if (Storage.keys.length == 0){
      return $location.path('/new');
    } else {
      return $location.path('/main');
    }
  };
  
  $scope.isEdesk = function(){
    return ($scope.private_key.substring(0, 5) == "edesk");
  };
  var restoreEnd = function(keys){
    var keys = {sk : keys.sk, pk : keys.pk, pkh : keys.pkh, type : "encrypted"};
    var identity = {
      pkh : keys.pkh,
      accounts : [{title: "Manager " + (Storage.keys.length+1), address : keys.pkh, public_key : keys.pk}],
      account : 0
    };
    if ($scope.type == 'ico' && $scope.activation_code){
      window.showLoader(); 
      window.eztz.rpc.activate(keys.pkh, $scope.activation_code).then(function(){
        $scope.$apply(function(){
          window.hideLoader();    
          Storage.setStore(identity, keys);          
          SweetAlert.swal(Lang.translate('awesome'), Lang.translate('activation_successful'), "success");
          Storage.ico = true;
          Storage.restored = true;
          Storage.newAccount(identity, keys);
          Storage.addNewAccount();
          ss = Storage.data;
          if (Storage.keys.length <= 1){
            return $location.path("/encrypt");
          } else {
            window.showLoader();
            setTimeout(function(){
              $scope.$apply(function(){
                ss.ensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync(Storage.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));;
                Storage.setStore(ss);
                return $location.path("/main");
              });
            }, 100);
          }
        });
      }).catch(function(e){
        $scope.$apply(function(){
          window.hideLoader();    
          return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('activation_unsuccessful'), 'error');
        });
      });
    } else {
      Storage.restored = true;
      Storage.addNewAccount(identity, keys);
      ss = Storage.data;
      if (Storage.keys.length <= 1){
        return $location.path("/encrypt");
      } else {
        window.showLoader();
        setTimeout(function(){
          $scope.$apply(function(){
            ss.ensk = sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync(Storage.password, Storage.keys[0].pkh, 30000, 512, 'sha512').toString(), btoa(JSON.stringify(Storage.keys)));;
            Storage.setStore(ss);
            return $location.path("/main");
          });
        }, 100);
      }
    }
  }
  $scope.restore = function(){
    if (['seed', 'ico'].indexOf($scope.type) >= 0 && !$scope.seed) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_please_enter_your_seed_words'), 'error');
    if (['seed', 'ico'].indexOf($scope.type) >= 0 && !window.eztz.library.bip39.validateMnemonic($scope.seed)) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_seed_words_not_valid'), 'error');

    if ($scope.type == 'ico' && !$scope.ico_password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_passphrase'), 'error');
    if ($scope.type == 'ico' && !$scope.email) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_email'), 'error');
    if ($scope.type == 'ico' && !$scope.address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_address'), 'error');
    if ($scope.type == 'private' && !$scope.private_key) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_private_key'), 'error');
    if ($scope.type == 'private' && $scope.isEdesk() && !$scope.encryption_password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_encryption_password'), 'error');
    $scope.text = Lang.translate('restoring');
    if ($scope.type == 'seed'){
      var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.passphrase);          
    } else if ($scope.type == 'ico'){
      var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.email + $scope.ico_password);       
      if ($scope.address != keys.pkh) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_fundraiser_details_dont_mach'), 'error');
    } else if ($scope.type == 'private'){
      if ($scope.isEdesk()){
        return window.eztz.crypto.extractEncryptedKeys($scope.private_key, $scope.encryption_password).then(function(k){
          $scope.$apply(function(){
            restoreEnd(k);
          });
        }).catch(function(e){
          return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_import_encrypted'), 'error');
        });
      } else {        
        var keys = window.eztz.crypto.extractKeys($scope.private_key);          
      }
    }
    restoreEnd(keys);
  };
}])
;