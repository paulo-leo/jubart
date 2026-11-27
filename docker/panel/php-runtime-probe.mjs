// Fixed diagnostic only: no application bootstrap, phpinfo(), Composer execution or input code.
export const phpRuntimeIniKeys=['memory_limit','upload_max_filesize','post_max_size','max_execution_time','display_errors','expose_php','session.save_handler','session.cookie_secure','session.gc_maxlifetime','opcache.enable','opcache.enable_cli','opcache.memory_consumption'];
export const phpRuntimeCode=String.raw`
$keys=${JSON.stringify(phpRuntimeIniKeys)};
$ini=[];foreach($keys as $key){$ini[$key]=ini_get($key);}
$modules=get_loaded_extensions();sort($modules,SORT_NATURAL|SORT_FLAG_CASE);
$extensions=[];foreach($modules as $name){$version=phpversion($name);$extensions[]=['name'=>$name,'version'=>$version===false?null:$version];}
$composer=['installed'=>false,'available'=>false,'version'=>null,'path'=>null,'source'=>'installed-phar-constants','reason'=>'not_found'];
foreach(['/usr/local/bin/composer','/usr/bin/composer','/opt/composer/composer.phar'] as $file){
 if(!is_file($file)){continue;}$composer['installed']=true;$composer['path']=$file;$composer['reason']='version_unavailable';
 if(extension_loaded('Phar')&&function_exists('token_get_all')){
  try{Phar::loadPhar($file);
  $text=@file_get_contents('phar://'.$file.'/src/Composer/Composer.php',false,null,0,65536);
  if(is_string($text)){
   $tokens=token_get_all($text);$constants=[];$count=count($tokens);
   for($i=0;$i<$count;$i++){
    if(!is_array($tokens[$i])||$tokens[$i][0]!==T_CONST){continue;}$declaration='';
    for($j=$i+1;$j<$count;$j++){$part=$tokens[$j];if(is_array($part)&&in_array($part[0],[T_COMMENT,T_DOC_COMMENT],true)){continue;}$declaration.=is_array($part)?$part[1]:$part;if($part===';'){break;}}
    if(preg_match('/^\s*(?:string\s+)?(VERSION|SOURCE_VERSION|BRANCH_ALIAS_VERSION)\s*=\s*([\x22\x27])([^\x22\x27]*)\2\s*;$/',$declaration,$matches)){$constants[$matches[1]]=$matches[3];}
   }
   $version=$constants['VERSION']??'';
   if($version==='@package_version@'){$version=$constants['SOURCE_VERSION']??'';}
   elseif(preg_match('/^[a-f0-9]{40}$/',$version)&&!empty($constants['BRANCH_ALIAS_VERSION'])){$version=$constants['BRANCH_ALIAS_VERSION'].'+'.$version;}
   if(strlen($version)<=128&&preg_match('/^[0-9]+(?:\.[0-9]+){1,3}(?:[-+][A-Za-z0-9.+-]+)?$/',$version)){$composer['version']=$version;$composer['available']=true;$composer['reason']=null;}
  }
  }catch(Throwable $error){}
 }break;
}
echo json_encode(['version'=>PHP_VERSION,'zendVersion'=>zend_version(),'sapi'=>PHP_SAPI,'integerBits'=>PHP_INT_SIZE*8,'modules'=>$modules,'extensions'=>$extensions,'ini'=>$ini,'loadedFile'=>php_ini_loaded_file(),'scannedFiles'=>php_ini_scanned_files(),'composer'=>$composer],JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
`;
export const phpRuntimeArguments=['-d','auto_prepend_file=','-d','auto_append_file=','-r',phpRuntimeCode];
