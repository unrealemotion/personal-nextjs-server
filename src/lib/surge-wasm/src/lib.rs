use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use wasm_bindgen::prelude::*;
use calamine::{Reader, Data, DataType};

// --- Helper Functions ---

#[inline]
fn normalize_key(key: &str) -> String {
    let mut k = key.trim();
    if k.starts_with("{{") && k.ends_with("}}") {
        k = k[2..k.len() - 2].trim();
    }
    k.to_string()
}

fn interpolate_string(template: &str, context: &HashMap<String, String>) -> String {
    let mut result = String::with_capacity(template.len());
    let mut last_pos = 0;
    
    while let Some(start_offset) = template[last_pos..].find("{{") {
        let absolute_start = last_pos + start_offset;
        result.push_str(&template[last_pos..absolute_start]);
        
        if let Some(end_offset) = template[absolute_start + 2..].find("}}") {
            let absolute_end = absolute_start + 2 + end_offset;
            let raw_key = &template[absolute_start + 2..absolute_end];
            let norm_key = normalize_key(raw_key);
            
            if let Some(val) = context.get(&norm_key) {
                result.push_str(val);
            } else {
                // If not found, resolve to empty string (matches JS: return "")
            }
            last_pos = absolute_end + 2;
        } else {
            result.push_str("{{");
            last_pos = absolute_start + 2;
        }
    }
    result.push_str(&template[last_pos..]);
    result
}

// --- Exposed WASM Functions ---

#[wasm_bindgen]
pub fn strip_json_comments(json_str: &str) -> String {
    let mut result = String::with_capacity(json_str.len());
    let chars: Vec<char> = json_str.chars().collect();
    let mut i = 0;
    let mut in_string = false;
    let mut escaped = false;

    while i < chars.len() {
        let c = chars[i];
        if in_string {
            result.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
        } else {
            if c == '"' {
                in_string = true;
                result.push(c);
                i += 1;
            } else if c == '/' && i + 1 < chars.len() {
                let next_c = chars[i + 1];
                if next_c == '/' {
                    // Skip single line comment
                    i += 2;
                    while i < chars.len() && chars[i] != '\n' && chars[i] != '\r' {
                        i += 1;
                    }
                } else if next_c == '*' {
                    // Skip block comment
                    i += 2;
                    let mut closed = false;
                    while i + 1 < chars.len() {
                        if chars[i] == '*' && chars[i + 1] == '/' {
                            i += 2;
                            closed = true;
                            break;
                        }
                        i += 1;
                    }
                    if !closed {
                        i = chars.len();
                    }
                } else {
                    result.push(c);
                    i += 1;
                }
            } else {
                result.push(c);
                i += 1;
            }
        }
    }
    result
}

// --- RustExecutionContext ---

#[wasm_bindgen]
pub struct RustExecutionContext {
    context: HashMap<String, String>,
}

#[wasm_bindgen]
impl RustExecutionContext {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            context: HashMap::new(),
        }
    }

    pub fn insert(&mut self, key: &str, value: &str) {
        let norm = normalize_key(key);
        self.context.insert(norm, value.to_string());
    }

    pub fn insert_record(&mut self, record: &JsValue) {
        if let Ok(map) = serde_wasm_bindgen::from_value::<HashMap<String, Value>>(record.clone()) {
            for (k, v) in map {
                let norm = normalize_key(&k);
                let val_str = match v {
                    Value::Null => "".to_string(),
                    Value::Bool(b) => b.to_string(),
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s,
                    Value::Array(arr) => serde_json::to_string(&arr).unwrap_or_default(),
                    Value::Object(map) => serde_json::to_string(&map).unwrap_or_default(),
                };
                self.context.insert(norm, val_str);
            }
        }
    }

    pub fn insert_val_flat(&mut self, prefix: &str, val: &JsValue) {
        if let Ok(serde_val) = serde_wasm_bindgen::from_value::<Value>(val.clone()) {
            self.flatten_val(&serde_val, prefix);
        }
    }

    pub fn interpolate(&self, template: &str) -> String {
        interpolate_string(template, &self.context)
    }

    fn flatten_val(&mut self, val: &Value, prefix: &str) {
        match val {
            Value::Null => {
                self.context.insert(normalize_key(prefix), "".to_string());
            }
            Value::Bool(b) => {
                self.context.insert(normalize_key(prefix), b.to_string());
            }
            Value::Number(n) => {
                self.context.insert(normalize_key(prefix), n.to_string());
            }
            Value::String(s) => {
                self.context.insert(normalize_key(prefix), s.clone());
            }
            Value::Array(arr) => {
                if let Ok(json_str) = serde_json::to_string(arr) {
                    self.context.insert(normalize_key(prefix), json_str);
                }
                for (i, item) in arr.iter().enumerate() {
                    let sub_prefix = if prefix.is_empty() {
                        i.to_string()
                    } else {
                        format!("{}.{}", prefix, i)
                    };
                    self.flatten_val(item, &sub_prefix);
                }
            }
            Value::Object(map) => {
                if let Ok(json_str) = serde_json::to_string(map) {
                    self.context.insert(normalize_key(prefix), json_str);
                }
                for (key, item) in map.iter() {
                    let sub_prefix = if prefix.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", prefix, key)
                    };
                    self.flatten_val(item, &sub_prefix);
                }
            }
        }
    }
}

// --- JSON Nexus Table Flattener ---

#[derive(Deserialize)]
pub struct ConvertOptions {
    #[serde(rename = "flattenObjects")]
    flatten_objects: bool,
    #[serde(rename = "splitArrays")]
    split_arrays: bool,
    #[serde(rename = "maxArraySplitLimit")]
    max_array_split_limit: Option<usize>,
}

#[wasm_bindgen]
pub fn json_to_table_data(json_val: &JsValue, options_val: &JsValue) -> Result<JsValue, JsValue> {
    let val: Value = serde_wasm_bindgen::from_value(json_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;
    let options: ConvertOptions = serde_wasm_bindgen::from_value(options_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid Options: {}", e)))?;

    let result = json_to_table_data_impl(val, &options);
    
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

fn json_to_table_data_impl(val: Value, options: &ConvertOptions) -> Vec<Map<String, Value>> {
    match val {
        Value::Null => vec![],
        Value::Array(arr) => {
            let mut all_rows = Vec::new();
            for item in arr {
                all_rows.extend(expand_item(item, options));
            }
            all_rows
        }
        other => expand_item(other, options),
    }
}

fn expand_item(item: Value, options: &ConvertOptions) -> Vec<Map<String, Value>> {
    match item {
        Value::Object(map) => {
            if map.is_empty() {
                return vec![Map::new()];
            }
            let mut current_rows = vec![Map::new()];
            for (k, v) in map {
                current_rows = process_field(current_rows, v, &k, options);
            }
            current_rows
        }
        other => {
            let mut row = Map::new();
            match &other {
                Value::Array(arr) => {
                    if let Ok(json_str) = serde_json::to_string(arr) {
                        row.insert("value".to_string(), Value::String(json_str));
                    } else {
                        row.insert("value".to_string(), other);
                    }
                }
                _ => {
                    row.insert("value".to_string(), other);
                }
            }
            vec![row]
        }
    }
}

fn process_field(
    rows: Vec<Map<String, Value>>,
    val: Value,
    path: &str,
    options: &ConvertOptions,
) -> Vec<Map<String, Value>> {
    match val {
        Value::Null => {
            let mut next_rows = rows;
            for r in &mut next_rows {
                r.insert(path.to_string(), Value::Null);
            }
            next_rows
        }
        Value::Array(arr) => {
            if options.split_arrays {
                if arr.is_empty() {
                    let mut next_rows = rows;
                    for r in &mut next_rows {
                        r.insert(path.to_string(), Value::Null);
                    }
                    return next_rows;
                }
                let limit = options.max_array_split_limit.unwrap_or(5);
                let sliced = if arr.len() > limit { &arr[..limit] } else { &arr[..] };
                
                let mut next_rows = Vec::new();
                for r in &rows {
                    for el in sliced {
                        let sub_rows = expand_value(el.clone(), path, options);
                        for sub_row in sub_rows {
                            let mut merged = r.clone();
                            for (k, v) in sub_row {
                                merged.insert(k, v);
                            }
                            next_rows.push(merged);
                        }
                    }
                }
                next_rows
            } else {
                let mut next_rows = rows;
                if let Ok(json_str) = serde_json::to_string(&arr) {
                    for r in &mut next_rows {
                        r.insert(path.to_string(), Value::String(json_str.clone()));
                    }
                }
                next_rows
            }
        }
        Value::Object(map) => {
            if options.flatten_objects {
                if map.is_empty() {
                    let mut next_rows = rows;
                    for r in &mut next_rows {
                        r.insert(path.to_string(), Value::String("{}".to_string()));
                    }
                    return next_rows;
                }
                let mut temp_rows = rows;
                for (k, v) in map {
                    let sub_path = if path.is_empty() { k.to_string() } else { format!("{}.{}", path, k) };
                    temp_rows = process_field(temp_rows, v, &sub_path, options);
                }
                temp_rows
            } else {
                let mut next_rows = rows;
                if let Ok(json_str) = serde_json::to_string(&map) {
                    for r in &mut next_rows {
                        r.insert(path.to_string(), Value::String(json_str.clone()));
                    }
                }
                next_rows
            }
        }
        other => {
            let mut next_rows = rows;
            for r in &mut next_rows {
                r.insert(path.to_string(), other.clone());
            }
            next_rows
        }
    }
}

fn expand_value(val: Value, path: &str, options: &ConvertOptions) -> Vec<Map<String, Value>> {
    match val {
        Value::Null => {
            let mut r = Map::new();
            r.insert(path.to_string(), Value::Null);
            vec![r]
        }
        Value::Array(arr) => {
            if options.split_arrays {
                if arr.is_empty() {
                    let mut r = Map::new();
                    r.insert(path.to_string(), Value::Null);
                    return vec![r];
                }
                let limit = options.max_array_split_limit.unwrap_or(5);
                let sliced = if arr.len() > limit { &arr[..limit] } else { &arr[..] };
                let mut next_rows = Vec::new();
                for el in sliced {
                    next_rows.extend(expand_value(el.clone(), path, options));
                }
                next_rows
            } else {
                let mut r = Map::new();
                if let Ok(json_str) = serde_json::to_string(&arr) {
                    r.insert(path.to_string(), Value::String(json_str));
                }
                vec![r]
            }
        }
        Value::Object(map) => {
            if options.flatten_objects {
                if map.is_empty() {
                    let mut r = Map::new();
                    r.insert(path.to_string(), Value::String("{}".to_string()));
                    return vec![r];
                }
                let mut sub_rows = vec![Map::new()];
                for (k, v) in map {
                    let sub_path = if path.is_empty() { k.to_string() } else { format!("{}.{}", path, k) };
                    sub_rows = process_field(sub_rows, v, &sub_path, options);
                }
                sub_rows
            } else {
                let mut r = Map::new();
                if let Ok(json_str) = serde_json::to_string(&map) {
                    r.insert(path.to_string(), Value::String(json_str));
                }
                vec![r]
            }
        }
        other => {
            let mut r = Map::new();
            r.insert(path.to_string(), other);
            vec![r]
        }
    }
}

// --- Spreadsheet Parser Helpers and Functions ---

fn parse_csv_value(s: &str) -> Value {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Value::String("".to_string());
    }
    if trimmed.eq_ignore_ascii_case("true") {
        return Value::Bool(true);
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return Value::Bool(false);
    }
    if trimmed.starts_with('0') && trimmed.len() > 1 && !trimmed.starts_with("0.") {
        return Value::String(trimmed.to_string());
    }
    if let Ok(i) = trimmed.parse::<i64>() {
        return Value::Number(i.into());
    }
    if let Ok(f) = trimmed.parse::<f64>() {
        if let Some(n) = serde_json::Number::from_f64(f) {
            return Value::Number(n);
        }
    }
    Value::String(s.to_string())
}

fn calamine_cell_to_json_value(cell: &Data) -> Value {
    match cell {
        Data::Int(v) => Value::Number((*v).into()),
        Data::Float(v) => {
            let val = *v;
            if let Some(n) = serde_json::Number::from_f64(val) {
                Value::Number(n)
            } else {
                Value::String(val.to_string())
            }
        }
        Data::String(v) => Value::String(v.clone()),
        Data::Bool(v) => Value::Bool(*v),
        Data::DateTime(v) => {
            if let Some(dt) = cell.as_datetime() {
                let dt_str = dt.to_string();
                if dt_str.ends_with(" 00:00:00") {
                    Value::String(dt_str[..10].to_string())
                } else {
                    Value::String(dt_str)
                }
            } else {
                let f = v.as_f64();
                if let Some(n) = serde_json::Number::from_f64(f) {
                    Value::Number(n)
                } else {
                    Value::String(f.to_string())
                }
            }
        }
        Data::DateTimeIso(v) => Value::String(v.clone()),
        Data::DurationIso(v) => Value::String(v.clone()),
        Data::Error(err) => Value::String(format!("{:?}", err)),
        Data::Empty => Value::String("".to_string()),
    }
}

#[wasm_bindgen]
pub fn parse_spreadsheet(file_bytes: &[u8], extension: &str) -> Result<JsValue, JsValue> {
    let extension_lc = extension.to_lowercase();
    let extension_trimmed = extension_lc.trim().trim_start_matches('.');

    let records = if extension_trimmed == "csv" {
        let mut data = file_bytes;
        if data.starts_with(&[0xEF, 0xBB, 0xBF]) {
            data = &data[3..];
        }

        let mut rdr = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(std::io::Cursor::new(data));

        let headers = rdr.headers()
            .map_err(|e| JsValue::from_str(&format!("Failed to read CSV headers: {}", e)))?
            .clone();

        let mut records = Vec::new();
        for result in rdr.records() {
            let record = result.map_err(|e| JsValue::from_str(&format!("Failed to read CSV record: {}", e)))?;
            let mut map = Map::new();
            for (i, header) in headers.iter().enumerate() {
                if header.is_empty() {
                    continue;
                }
                let field = record.get(i).unwrap_or("");
                let val = parse_csv_value(field);
                map.insert(header.to_string(), val);
            }
            records.push(Value::Object(map));
        }
        records
    } else {
        let cursor = std::io::Cursor::new(file_bytes);
        let mut workbook = calamine::open_workbook_auto_from_rs(cursor)
            .map_err(|e| JsValue::from_str(&format!("Failed to open workbook: {}", e)))?;

        let first_sheet_name = workbook.sheet_names().first()
            .ok_or_else(|| JsValue::from_str("Workbook has no sheets"))?
            .clone();

        let range = workbook.worksheet_range(&first_sheet_name)
            .map_err(|e| JsValue::from_str(&format!("Failed to read sheet range: {}", e)))?;

        let mut rows = range.rows();
        let headers = if let Some(header_row) = rows.next() {
            header_row.iter().map(|cell| cell.to_string().trim().to_string()).collect::<Vec<String>>()
        } else {
            return Err(JsValue::from_str("Sheet is empty"));
        };

        let mut records = Vec::new();
        for row in rows {
            let mut map = Map::new();
            for (i, header) in headers.iter().enumerate() {
                if header.is_empty() {
                    continue;
                }
                let cell_value = row.get(i).unwrap_or(&Data::Empty);
                let val = calamine_cell_to_json_value(cell_value);
                map.insert(header.clone(), val);
            }
            records.push(Value::Object(map));
        }
        records
    };

    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    records.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize parsed records: {}", e)))
}

#[derive(Serialize, Deserialize)]
pub struct ModifiedField {
    path: String,
    #[serde(rename = "oldValue")]
    old_value: Value,
    #[serde(rename = "newValue")]
    new_value: Value,
}

#[derive(Serialize, Deserialize)]
pub struct SemanticDiffResult {
    #[serde(rename = "type")]
    diff_type: String,
    added: Vec<String>,
    removed: Vec<String>,
    modified: Vec<ModifiedField>,
}

#[wasm_bindgen]
pub fn compute_semantic_diff(left_val: &JsValue, right_val: &JsValue) -> Result<JsValue, JsValue> {
    let left: Value = serde_wasm_bindgen::from_value(left_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid Left JSON: {}", e)))?;
    let right: Value = serde_wasm_bindgen::from_value(right_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid Right JSON: {}", e)))?;

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();

    fn compare(
        l: &Value, 
        r: &Value, 
        path: &str, 
        added: &mut Vec<String>, 
        removed: &mut Vec<String>, 
        modified: &mut Vec<ModifiedField>
    ) {
        if l == r {
            return;
        }

        match (l, r) {
            (Value::Array(arr_l), Value::Array(arr_r)) => {
                let max_len = std::cmp::max(arr_l.len(), arr_r.len());
                for i in 0..max_len {
                    let sub_path = format!("{}[{}]", path, i);
                    if i >= arr_l.len() {
                        added.push(sub_path);
                    } else if i >= arr_r.len() {
                        removed.push(sub_path);
                    } else {
                        compare(&arr_l[i], &arr_r[i], &sub_path, added, removed, modified);
                    }
                }
            }
            (Value::Object(map_l), Value::Object(map_r)) => {
                let all_keys: std::collections::BTreeSet<&String> = map_l.keys().chain(map_r.keys()).collect();
                for key in all_keys {
                    let sub_path = if path.is_empty() { key.to_string() } else { format!("{}.{}", path, key) };
                    let has_l = map_l.contains_key(key);
                    let has_r = map_r.contains_key(key);

                    if has_l && !has_r {
                        removed.push(sub_path);
                    } else if !has_l && has_r {
                        added.push(sub_path);
                    } else {
                        compare(&map_l[key], &map_r[key], &sub_path, added, removed, modified);
                    }
                }
            }
            (other_l, other_r) => {
                modified.push(ModifiedField {
                    path: path.to_string(),
                    old_value: other_l.clone(),
                    new_value: other_r.clone(),
                });
            }
        }
    }

    compare(&left, &right, "", &mut added, &mut removed, &mut modified);

    added.sort();
    removed.sort();
    modified.sort_by(|a, b| a.path.cmp(&b.path));

    let diff_type = if added.is_empty() && removed.is_empty() && modified.is_empty() {
        "identical".to_string()
    } else {
        "different".to_string()
    };

    let result = SemanticDiffResult {
        diff_type,
        added,
        removed,
        modified,
    };

    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize diff result: {}", e)))
}

#[wasm_bindgen]
pub fn get_json_structure(val_js: &JsValue) -> Result<JsValue, JsValue> {
    let val: Value = serde_wasm_bindgen::from_value(val_js.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    fn get_structure(v: &Value) -> Value {
        match v {
            Value::Null => Value::String("<null>".to_string()),
            Value::Bool(_) => Value::String("<boolean>".to_string()),
            Value::Number(_) => Value::String("<number>".to_string()),
            Value::String(_) => Value::String("<string>".to_string()),
            Value::Array(arr) => {
                if arr.is_empty() {
                    Value::Array(vec![])
                } else {
                    let mut structured_arr = Vec::with_capacity(arr.len());
                    for item in arr {
                        structured_arr.push(get_structure(item));
                    }
                    Value::Array(structured_arr)
                }
            }
            Value::Object(map) => {
                let mut res = Map::new();
                let mut sorted_keys: Vec<&String> = map.keys().collect();
                sorted_keys.sort();
                for key in sorted_keys {
                    res.insert(key.clone(), get_structure(&map[key]));
                }
                Value::Object(res)
            }
        }
    }

    let result = get_structure(&val);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize JSON structure: {}", e)))
}

#[wasm_bindgen]
pub fn normalize_json_order(val_js: &JsValue, ignore_order: bool) -> Result<JsValue, JsValue> {
    let val: Value = serde_wasm_bindgen::from_value(val_js.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

    fn normalize(v: Value, ignore_order: bool) -> Value {
        match v {
            Value::Array(arr) => {
                let mut mapped: Vec<Value> = arr.into_iter()
                    .map(|item| normalize(item, ignore_order))
                    .collect();
                if ignore_order {
                    mapped.sort_by(|a, b| {
                        let str_a = serde_json::to_string(a).unwrap_or_default();
                        let str_b = serde_json::to_string(b).unwrap_or_default();
                        str_a.cmp(&str_b)
                    });
                }
                Value::Array(mapped)
            }
            Value::Object(map) => {
                let mut res = Map::new();
                if ignore_order {
                    let mut keys: Vec<String> = map.keys().cloned().collect();
                    keys.sort();
                    for key in keys {
                        if let Some(val) = map.get(&key) {
                            res.insert(key, normalize(val.clone(), ignore_order));
                        }
                    }
                } else {
                    for (key, val) in map {
                        res.insert(key, normalize(val, ignore_order));
                    }
                }
                Value::Object(res)
            }
            other => other,
        }
    }

    let result = normalize(val, ignore_order);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize normalized JSON: {}", e)))
}

#[derive(Serialize, Deserialize)]
pub struct SharedStructureResult {
    #[serde(rename = "leftIsolated")]
    left_isolated: Value,
    #[serde(rename = "rightIsolated")]
    right_isolated: Value,
}

#[wasm_bindgen]
pub fn get_shared_value_structure(left_val: &JsValue, right_val: &JsValue) -> Result<JsValue, JsValue> {
    let left: Value = serde_wasm_bindgen::from_value(left_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid Left JSON: {}", e)))?;
    let right: Value = serde_wasm_bindgen::from_value(right_val.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid Right JSON: {}", e)))?;

    fn get_shared(l: Value, r: Value) -> (Value, Value) {
        match (&l, &r) {
            (Value::Object(map_l), Value::Object(map_r)) => {
                let mut shared_keys = Vec::new();
                for k in map_l.keys() {
                    if map_r.contains_key(k) {
                        shared_keys.push(k.clone());
                    }
                }
                shared_keys.sort();

                let mut left_res = Map::new();
                let mut right_res = Map::new();

                for key in shared_keys {
                    let sub_l = map_l.get(&key).unwrap().clone();
                    let sub_r = map_r.get(&key).unwrap().clone();
                    let (iso_l, iso_r) = get_shared(sub_l, sub_r);
                    left_res.insert(key.clone(), iso_l);
                    right_res.insert(key, iso_r);
                }
                (Value::Object(left_res), Value::Object(right_res))
            }
            _ => (l, r),
        }
    }

    let (left_iso, right_iso) = get_shared(left, right);
    let result = SharedStructureResult {
        left_isolated: left_iso,
        right_isolated: right_iso,
    };

    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize shared structure: {}", e)))
}

#[wasm_bindgen]
pub fn flatten_object(obj_js: &JsValue, prefix: &str) -> Result<JsValue, JsValue> {
    let obj: Value = serde_wasm_bindgen::from_value(obj_js.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;
    let mut res = Map::new();

    fn flatten_impl(val: &Value, prefix: &str, res: &mut Map<String, Value>) {
        match val {
            Value::Null => {
                res.insert(prefix.to_string(), Value::String("".to_string()));
            }
            Value::Bool(b) => {
                res.insert(prefix.to_string(), Value::Bool(*b));
            }
            Value::Number(n) => {
                res.insert(prefix.to_string(), Value::Number(n.clone()));
            }
            Value::String(s) => {
                res.insert(prefix.to_string(), Value::String(s.clone()));
            }
            Value::Array(arr) => {
                if let Ok(json_str) = serde_json::to_string(arr) {
                    res.insert(prefix.to_string(), Value::String(json_str));
                }
                for (i, item) in arr.iter().enumerate() {
                    let sub_prefix = if prefix.is_empty() {
                        i.to_string()
                    } else {
                        format!("{}.{}", prefix, i)
                    };
                    flatten_impl(item, &sub_prefix, res);
                }
            }
            Value::Object(map) => {
                if let Ok(json_str) = serde_json::to_string(map) {
                    res.insert(prefix.to_string(), Value::String(json_str));
                }
                for (k, v) in map.iter() {
                    let sub_prefix = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
                    flatten_impl(v, &sub_prefix, res);
                }
            }
        }
    }

    flatten_impl(&obj, prefix, &mut res);

    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    res.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize flattened object: {}", e)))
}

#[wasm_bindgen]
pub fn resolve_variables(
    text: &str,
    variables_map: &JsValue, // Record<string, string>
    depth_limit: usize,
) -> Result<String, JsValue> {
    let vars_raw: HashMap<String, Value> = serde_wasm_bindgen::from_value(variables_map.clone())
        .map_err(|e| JsValue::from_str(&format!("Invalid variables map: {}", e)))?;

    let mut vars = HashMap::new();
    for (k, v) in vars_raw {
        let val_str = match v {
            Value::Null => "".to_string(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            Value::String(s) => s,
            Value::Array(arr) => serde_json::to_string(&arr).unwrap_or_default(),
            Value::Object(map) => serde_json::to_string(&map).unwrap_or_default(),
        };
        vars.insert(k, val_str);
    }

    let mut resolved = text.to_string();
    for _ in 0..depth_limit {
        let mut next = String::with_capacity(resolved.len());
        let mut last_pos = 0;
        let mut changed = false;

        while let Some(start_offset) = resolved[last_pos..].find("{{") {
            let absolute_start = last_pos + start_offset;
            next.push_str(&resolved[last_pos..absolute_start]);

            if let Some(end_offset) = resolved[absolute_start + 2..].find("}}") {
                let absolute_end = absolute_start + 2 + end_offset;
                let raw_key = &resolved[absolute_start + 2..absolute_end];
                let trimmed_key = raw_key.trim();

                if let Some(val) = vars.get(trimmed_key) {
                    next.push_str(val);
                    changed = true;
                } else {
                    next.push_str(&resolved[absolute_start..absolute_end + 2]);
                }
                last_pos = absolute_end + 2;
            } else {
                next.push_str("{{");
                last_pos = absolute_start + 2;
            }
        }
        next.push_str(&resolved[last_pos..]);

        if !changed {
            break;
        }
        resolved = next;
    }
    Ok(resolved)
}

