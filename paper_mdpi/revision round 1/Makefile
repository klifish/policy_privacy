TECTONIC ?= tectonic
ROOT := ../..
BUILD_DIR := $(ROOT)/tmp/pdfs/revision-round-1
OUTPUT_DIR := output
SOURCES := reviewer1_response reviewer2_response reviewer3_response

.PHONY: all reviewer1 reviewer2 reviewer3 clean

all: reviewer1 reviewer2 reviewer3

reviewer1: reviewer1_response
reviewer2: reviewer2_response
reviewer3: reviewer3_response

$(SOURCES):
	mkdir -p "$(BUILD_DIR)" "$(OUTPUT_DIR)"
	$(TECTONIC) -X compile "$@.tex" --outdir "$(BUILD_DIR)" --keep-logs
	cp "$(BUILD_DIR)/$@.pdf" "$(OUTPUT_DIR)/$@.pdf"

clean:
	rm -f "$(BUILD_DIR)"/reviewer*_response.*
