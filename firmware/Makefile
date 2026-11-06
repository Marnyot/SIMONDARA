CXX ?= c++
CXXFLAGS ?= -std=c++17 -Wall -Wextra -Werror -O1
ARDUINO_CLI ?= arduino-cli
FQBN ?= esp8266:esp8266:nodemcuv2
PORT ?=

BUILD := build
TEST_BINS := $(BUILD)/test_air_status $(BUILD)/test_fault

.PHONY: test compile upload clean

test: $(TEST_BINS)
	./$(BUILD)/test_air_status
	./$(BUILD)/test_fault

$(BUILD)/test_air_status: test/test_air_status.cpp simondara/air_status.cpp simondara/air_status.h simondara/config.h
	@mkdir -p $(BUILD)
	$(CXX) $(CXXFLAGS) -Isimondara -o $@ test/test_air_status.cpp simondara/air_status.cpp

$(BUILD)/test_fault: test/test_fault.cpp simondara/fault.cpp simondara/fault.h simondara/config.h
	@mkdir -p $(BUILD)
	$(CXX) $(CXXFLAGS) -Isimondara -o $@ test/test_fault.cpp simondara/fault.cpp

compile:
	$(ARDUINO_CLI) compile --fqbn $(FQBN) --warnings all simondara

upload:
	@test -n "$(PORT)" || (echo "pakai: make upload PORT=/dev/cu.usbserial-XXXX" && exit 1)
	$(ARDUINO_CLI) upload --fqbn $(FQBN) -p $(PORT) simondara

clean:
	rm -rf $(BUILD)
